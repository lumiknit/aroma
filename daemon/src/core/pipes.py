import datetime
import re
import json
import os
import pathlib
from packaging.version import Version

import numpy as np
import torch
from transformers import CLIPTextModel
from diffusers import *
import safetensors.torch

import PIL

from .util import torch_device, is_torch_2_0
from .prompt import Prompt


def filter_image_size(len):
    if not isinstance(len, int) or len < 0:
        return 16
    if len % 8 != 0:
        return (len // 8 + 1) * 8
    return len


def load_safetensors_lora(pipeline, checkpoint_path, LORA_PREFIX_UNET="lora_unet", LORA_PREFIX_TEXT_ENCODER="lora_te", alpha=0.75):
    # load LoRA weight from .safetensors
    state_dict = safetensors.torch.load_file(checkpoint_path)

    visited = []

    # directly update weight in diffusers model
    for key in state_dict:
        # it is suggested to print out the key, it usually will be something like below
        # "lora_te_text_model_encoder_layers_0_self_attn_k_proj.lora_down.weight"

        # as we have set the alpha beforehand, so just skip
        if ".alpha" in key or key in visited:
            continue

        if "text" in key:
            layer_infos = key.split(".")[0].split(LORA_PREFIX_TEXT_ENCODER + "_")[-1].split("_")
            curr_layer = pipeline.text_encoder
        else:
            layer_infos = key.split(".")[0].split(LORA_PREFIX_UNET + "_")[-1].split("_")
            curr_layer = pipeline.unet

        # find the target layer
        temp_name = layer_infos.pop(0)
        while len(layer_infos) > -1:
            try:
                curr_layer = curr_layer.__getattr__(temp_name)
                if len(layer_infos) > 0:
                    temp_name = layer_infos.pop(0)
                elif len(layer_infos) == 0:
                    break
            except Exception:
                if len(temp_name) > 0:
                    temp_name += "_" + layer_infos.pop(0)
                else:
                    temp_name = layer_infos.pop(0)

        pair_keys = []
        if "lora_down" in key:
            pair_keys.append(key.replace("lora_down", "lora_up"))
            pair_keys.append(key)
        else:
            pair_keys.append(key)
            pair_keys.append(key.replace("lora_up", "lora_down"))

        # update weight
        if len(state_dict[pair_keys[0]].shape) == 4:
            weight_up = state_dict[pair_keys[0]].squeeze(3).squeeze(2).to(torch.float32)
            weight_down = state_dict[pair_keys[1]].squeeze(3).squeeze(2).to(torch.float32)
            curr_layer.weight.data += alpha * torch.mm(weight_up, weight_down).unsqueeze(2).unsqueeze(3)
        else:
            weight_up = state_dict[pair_keys[0]].to(torch.float32)
            weight_down = state_dict[pair_keys[1]].to(torch.float32)
            curr_layer.weight.data += alpha * torch.mm(weight_up, weight_down)

        # update visited list
        for item in pair_keys:
            visited.append(item)

    return pipeline


# Pipeline wrappers
class SDPipes:
    def __init__(self):
        self.model_path = None
        self.clip_skip = 0

        self.prompt = Prompt(".")
        self.negative_prompt = Prompt(".")

        # Real pipelines
        self.txt2img = None
        self.img2img = None

    def _load_model(
        self,
        state,
        path,
        dtype=torch.float16,
        clip_skip=0,
        lora_path="",
        lora_alpha=0.75,
    ):
        # Create kwargs
        kwargs = {}

        # Remove old model
        if self.txt2img is not None:
            del self.txt2img
            # Clean cuda cache
            if torch_device() == "cuda":
                torch.cuda.empty_cache()

        # Create txt2img pipeline
        print(f"[INFO] Loading pipeline from {path}")
        print(f"       kwargs = {kwargs}")
        try:
            txt2img = DiffusionPipeline.from_pretrained(
                path,
                **kwargs,
                torch_dtype=dtype,
                local_files_only=True,
            )
        except Exception as e:
            print(f"[ERROR] Cannot load model {path}: {e}")
            raise Exception(f"Cannot load model {path}, please check selected model")

        # Clip skip
        print(f"[INFO] Clip skip {clip_skip}")
        if clip_skip > 0:
            txt2img.text_encoder = CLIPTextModel.from_pretrained(
                path,
                torch_dtype=dtype,
                subfolder="text_encoder",
                num_hidden_layers=(
                    txt2img.text_encoder.config.num_hidden_layers - clip_skip
                ),
                local_files_only=True,
            )
        print(
            f"[INFO] CLIP num hidden layers = {txt2img.text_encoder.config.num_hidden_layers}"
        )

        # Disable safety checker for performance
        txt2img.safety_checker = None

        # Load Lora
        if lora_path != "":
            print(f"[INFO] Loading Lora from {lora_path}")
            load_safetensors_lora(txt2img, lora_path, alpha=lora_alpha)

        # Load Textual Inversion
        for root, dirs, files in os.walk(state.models_root):
            # Check if root is textual inversion root
            base = os.path.basename(root)
            base.lower()
            base = re.sub("[^a-z0-9]+", "", base)
            if base == "textualinversion" or base == "textualinversions":
                print(f"[INFO] Found textual inversion root {root}")
                for f in files:
                    ti_path = os.path.join(root, f)
                    if ti_path.endswith(".pt") or ti_path.endswith(".safetensors"):
                        token = pathlib.Path(ti_path).stem
                        print(
                            f"[INFO] Loading textual inversion from {path} as {token}"
                        )
                        try:
                            txt2img.load_textual_inversion(
                                ti_path,
                                token=token,
                            )
                        except Exception as e:
                            print(
                                f"[WARNING] Cannot load textual inversion {ti_path}: {e}"
                            )
                            print(f"[WARINIG] just ignore {token}")

        # Send to device
        txt2img = txt2img.to(torch_device())

        txt2img.scheduler = DPMSolverMultistepScheduler.from_config(
            txt2img.scheduler.config
        )
        txt2img.scheduler.prediction_type = "sample"
        txt2img.scheduler.use_karras_sigmas = True

        print(f"[INFO] Set-up pipeline")

        # Enable memory efficient options
        # txt2img.enable_attention_slicing(slice_size="auto")
        # txt2img.enable_vae_slicing()
        # txt2img.enable_vae_tiling()

        # Torch 2.0 Performance Tuning
        if is_torch_2_0():
            from diffusers.models.attention_processor import AttnProcessor2_0

            txt2img.unet.set_attn_processor(AttnProcessor2_0())

        if torch_device() == "cuda":
            # txt2img.unet = torch.compile(txt2img.unet)
            try:
                import xformers

                txt2img.enable_xformers_memory_efficient_attention()
            except ImportError:
                print(
                    f"[WARN] Cannot import xformers, cannot enable memory efficient attention"
                )
                pass

        img2img = StableDiffusionImg2ImgPipeline(
            vae=txt2img.vae,
            text_encoder=txt2img.text_encoder,
            tokenizer=txt2img.tokenizer,
            unet=txt2img.unet,
            scheduler=txt2img.scheduler,
            safety_checker=None,
            feature_extractor=txt2img.feature_extractor,
            requires_safety_checker=False,
        ).to(torch_device())

        # Done, update variables
        self.model_path = path
        self.clip_skip = clip_skip
        self.lora_path = lora_path
        self.lora_alpha = lora_alpha
        self.txt2img = txt2img
        self.img2img = img2img
        self.default_scheduler = txt2img.scheduler

    def _txt2img_load_model(self, state):
        print("[INFO] SDPipes: load_model")
        state.write_state("load_model", {})
        values = state.values
        lora_path = "" if len(values['model']['lora_path']) == 0 else f"{state.models_root}/{values['model']['lora_path']}"
        self._load_model(
            state,
            f"{state.models_root}/{values['model']['path']}",
            clip_skip=values["model"]["clip_skip"],
            lora_path=lora_path,
            lora_alpha=values["model"]["lora_alpha"],
        )
        return self._txt2img_update_prompt(state)

    def _txt2img_update_prompt(self, state):
        print("[INFO] SDPipes: update_prompt")
        state.write_state("update_prompt", {})
        values = state.values
        params = values["params"]
        self.prompt.update_embed(params["prompt"], self.txt2img)
        self.negative_prompt.update_embed(params["negative_prompt"], self.txt2img)
        # Prompt may changed because of random choose. put the values in state
        state.values["choosed_prompt"] = {
            "positive": self.prompt.pp_text,
            "negative": self.negative_prompt.pp_text,
        }
        return self._txt2img_generate(state)

    def _update_sampling_method(self, name):
        print(f"[INFO] SDPipes: update_sampling_method to {name}")
        new_scheduler = self.default_scheduler
        if name == "Euler":
            new_scheduler = EulerDiscreteScheduler.from_config(new_scheduler.config)
        elif name == "Euler A":
            new_scheduler = EulerAncestralDiscreteScheduler.from_config(
                new_scheduler.config
            )
        elif name == "LMS":
            new_scheduler = LMSDiscreteScheduler.from_config(new_scheduler.config)
        elif name == "Heun":
            new_scheduler = HeunDiscreteScheduler.from_config(new_scheduler.config)
        elif name == "DDIM":
            new_scheduler = DDIMScheduler.from_config(new_scheduler.config)
        elif name == "DDIM Inverse":
            new_scheduler = DDIMInverseScheduler.from_config(new_scheduler.config)
        elif name == "DDPM":
            new_scheduler = DDPMScheduler.from_config(new_scheduler.config)
        elif name == "DPM++ 2S":
            new_scheduler = DPMSolverSinglestepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = "dpmsolver++"
        elif name == "DPM++ 2M":
            new_scheduler = DPMSolverMultistepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = "dpmsolver++"
            new_scheduler.use_karras_sigmas = False
        elif name == "DPM++ 2M Karras":
            new_scheduler = DPMSolverMultistepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = "dpmsolver++"
            new_scheduler.use_karras_sigmas = True
        elif name == "DPM++ 3S":
            new_scheduler = DPMSolverSinglestepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = "dpmsolver++"
        elif name == "DPM++ 3M":
            new_scheduler = DPMSolverMultistepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = "dpmsolver++"
            new_scheduler.use_karras_sigmas = False
        elif name == "DPM++ 3M Karras":
            new_scheduler = DPMSolverMultistepScheduler.from_config(
                new_scheduler.config
            )
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = "dpmsolver++"
            new_scheduler.use_karras_sigmas = True
        elif name == "PNDM":
            new_scheduler = PNDMScheduler.from_config(new_scheduler.config)
        elif name == "IPNDM":
            new_scheduler = IPNDMScheduler.from_config(new_scheduler.config)
        else:
            print(f"[ERROR] Unknown sampling method: {name}")
        # Change scheduler
        self.txt2img.scheduler = new_scheduler
        self.img2img.scheduler = new_scheduler

    def _txt2img_generate(self, state):
        print("[INFO] SDPipes: generate")
        values = state.values
        params = values["params"]

        state.write_state("setup_params", {})
        kwargs = {}

        # Check params and generate
        kwargs["num_inference_steps"] = params["sampling_steps"]
        kwargs["guidance_scale"] = params["cfg_scale"]

        # Put size
        w = int(params["width"])
        h = int(params["height"])
        try:
            rng = float(params["size_range"])
            if rng > 0:
                dr = float(np.random.uniform(low=-rng, high=rng))
                # Preserve area
                area = w * h
                w = int(w * (1 + dr))
                h = int(area / w)
        except:
            print("[WARNING] Invalid size range, ignore it.")
        w = filter_image_size(w)
        h = filter_image_size(h)

        kwargs["width"] = w
        kwargs["height"] = h

        state.job["values"]["fixed_size"] = {
            "w": w,
            "h": h,
        }

        # If seed is given, use it
        if params["seed"] != "":
            try:
                s = int(params["seed"])
                kwargs["generator"] = [
                    torch.Generator(device=torch_device()).manual_seed(s)
                ]
            except:
                print("[WARNING] Invalid seed ignore it.")

        # Change sampling method
        state.write_state("update_sampler", {})
        self._update_sampling_method(params["sampling_method"])

        # Generate
        state.write_state("start_generate", {})
        total_steps = int(params["sampling_steps"])

        def callback(step, timestep, latents):
            state.write_state(
                "txt2img",
                {
                    "step": int(step),
                    "total_steps": total_steps,
                },
            )

        result = self.txt2img(
            # prompt=self.prompt.text,
            # negative_prompt=self.negative_prompt.text,
            prompt_embeds=self.prompt.embeds,
            negative_prompt_embeds=self.negative_prompt.embeds,
            num_images_per_prompt=1,
            return_dict=True,
            callback=callback,
            **kwargs,
        )
        callback(total_steps, 0, None)

        # If highres,
        highres_fix = params["highres_fix"]
        if len(highres_fix) > 0:
            return self._txt2img_highres_fix(state, result.images[0])

        # Return image
        state.write_state("done", {})
        return result.images[0]

    def _txt2img_highres_fix(self, state, img):
        values = state.values
        params = values["params"]
        highres_fix = params["highres_fix"]

        for c, hf in enumerate(highres_fix):
            print(f"[INFO] SDPipes: highres_fix - {c}")
            state.write_state("setup_highres_params", {})
            # Get Size
            if "scale" in hf:
                hf_scale = float(hf["scale"])
                hf_scale = min(max(hf_scale, 0.1), 10.0)
                hf_width = int(img.width * hf_scale)
                hf_height = int(img.height * hf_scale)
            else:
                hf_width = filter_image_size(hf["width"])
                hf_height = filter_image_size(hf["height"])
            # Resize
            img = img.resize((hf_width, hf_height), PIL.Image.LANCZOS)

            kwargs = {}
            kwargs["num_inference_steps"] = params["sampling_steps"]
            kwargs["guidance_scale"] = params["cfg_scale"]
            kwargs["strength"] = hf["strength"]

            # Generation
            state.write_state("start_highres_fix", {})
            total_steps = int(params["sampling_steps"] * hf["strength"])

            def callback(step, timestep, latents):
                state.write_state(
                    "highres_fix",
                    {
                        "count": c,
                        "step": int(step),
                        "total_steps": total_steps,
                    },
                )

            result = self.img2img(
                image=img,
                # prompt=self.prompt.text,
                # negative_prompt=self.negative_prompt.text,
                prompt_embeds=self.prompt.embeds,
                negative_prompt_embeds=self.negative_prompt.embeds,
                num_images_per_prompt=1,
                callback=callback,
                **kwargs,
            )
            callback(total_steps, 0, None)
            img = result.images[0]
        state.write_state("done", {})
        return img

    def text_to_image(self, state):
        with torch.inference_mode():
            values = state.values
            params = values["params"]
            # If model changed, run from reload model
            print(f"A: {self.model_path}")
            print(f"B: {state.models_root}/{values['model']['path']}")
            lora_path = "" if len(values['model']['lora_path']) == 0 else f"{state.models_root}/{values['model']['lora_path']}"
            if (
                self.model_path != f"{state.models_root}/{values['model']['path']}"
                or self.clip_skip != values["model"]["clip_skip"]
                or self.lora_path != lora_path
                or self.lora_alpha != values['model']['lora_alpha']
            ):
                return self._txt2img_load_model(state)
            # Otherwise, run from update_prompt
            return self._txt2img_update_prompt(state)
