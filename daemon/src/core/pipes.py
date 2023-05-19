import datetime
import json
from packaging.version import Version

import torch
from diffusers import *

import PIL

from .util import torch_device, is_torch_2_0
from .prompt import Prompt

def filter_image_size(len):
    if not isinstance(len, int) or len < 0:
        return 16
    if len % 8 != 0:
        return (len // 8 + 1) * 8
    return len

# Pipeline wrappers
class SDPipes:
    def __init__(self):
        self.model_path = None
        self.model_revision = None
        self.model_variant = None

        self.prompt = Prompt(".")
        self.negative_prompt = Prompt(".")

        # Real pipelines
        self.txt2img = None
        self.img2img = None

    def _load_model(
            self,
            state,
            path,
            revision=None,
            variant=None,
            dtype=torch.float16):
        # Create kwargs
        kwargs = {}
        if revision is not None:
            kwargs['revision'] = revision
        if variant is not None:
            kwargs['variant'] = variant
        
        # Create txt2img pipeline
        print(f"[INFO] Loading pipeline from {path}")
        print(f"       kwargs = {kwargs}")
        txt2img = DiffusionPipeline.from_pretrained(
            path,
            **kwargs,
            torch_dtype=dtype,
        )
        if txt2img is None:
            raise Exception("Failed to load model")

        # Load Textual Inversion
        for inv in state.values['textual_inversions']:
            txt2img.load_textual_inversion(
                state.models_root,
                weight_name=inv,
            )

        txt2img = txt2img.to(torch_device())
        
        txt2img.scheduler = DPMSolverMultistepScheduler.from_config(txt2img.scheduler.config)
        txt2img.scheduler.prediction_type = "sample"
        txt2img.scheduler.use_karras_sigmas = True

        print(f"[INFO] Set-up pipeline")

        # Disable safety checker for performance
        txt2img.safety_checker = None

        # Enable memory efficient options
        #txt2img.enable_attention_slicing(slice_size='auto')
        #txt2img.enable_vae_slicing()
        #txt2img.enable_vae_tiling()

        # Torch 2.0 Performance Tuning
        if is_torch_2_0():
            from diffusers.models.attention_processor import AttnProcessor2_0
            txt2img.unet.set_attn_processor(AttnProcessor2_0())

        if torch_device() == 'cuda':
            txt2img.unet = torch.compile(txt2img.unet)
            try:
                import xformers
                txt2img.enable_xformers_memory_efficient_attention()
            except ImportError:
                print(f"[WARN] Cannot import xformers, cannot enable memory efficient attention")
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
        self.model_revision = revision
        self.model_variant = variant
        self.txt2img = txt2img
        self.img2img = img2img
        self.default_scheduler = txt2img.scheduler

    def _txt2img_load_model(self, state):
        print("[INFO] SDPipes: load_model")
        state.write_state("load_model", {})
        values = state.values
        self._load_model(
            state,
            f"{state.models_root}/{values['model']['path']}",
            revision=values['model']['revision'],
            variant=values['model']['variant'],
        )
        return self._txt2img_update_prompt(state)

    def _txt2img_update_prompt(self, state):
        print("[INFO] SDPipes: update_prompt")
        state.write_state("update_prompt", {})
        values = state.values
        params = values['params']
        self.prompt.update_embed(params['prompt'], self.txt2img)
        self.negative_prompt.update_embed(params['negative_prompt'], self.txt2img)
        return self._txt2img_generate(state)

    def _update_sampling_method(self, name):
        print(f"[INFO] SDPipes: update_sampling_method to {name}")
        new_scheduler = self.default_scheduler
        if name == 'Euler':
            new_scheduler = EulerDiscreteScheduler \
                .from_config(new_scheduler.config)
        elif name == 'Euler A':
            new_scheduler = EulerAncestralDiscreteScheduler \
                .from_config(new_scheduler.config)
        elif name == 'LMS':
            new_scheduler = LMSDiscreteScheduler \
                .from_config(new_scheduler.config)
        elif name == "Heun":
            new_scheduler = HeunDiscreteScheduler \
                .from_config(new_scheduler.config)
        elif name == "DDIM":
            new_scheduler = DDIMScheduler \
                .from_config(new_scheduler.config)
        elif name == "DDIM Inverse":
            new_scheduler = DDIMInverseScheduler \
                .from_config(new_scheduler.config)
        elif name == "DDPM":
            new_scheduler = DDPMScheduler \
                .from_config(new_scheduler.config)
        elif name == "DPM++ 2S":
            new_scheduler = DPMSolverSinglestepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = 'dpmsolver++'
        elif name == "DPM++ 2M":
            new_scheduler = DPMSolverMultistepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = 'dpmsolver++'
            new_scheduler.use_karras_sigmas = False
        elif name == "DPM++ 2M Karras":
            new_scheduler = DPMSolverMultistepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 2
            new_scheduler.algorithm_type = 'dpmsolver++'
            new_scheduler.use_karras_sigmas = True
        elif name == "DPM++ 3S":
            new_scheduler = DPMSolverSinglestepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = 'dpmsolver++'
        elif name == "DPM++ 3M":
            new_scheduler = DPMSolverMultistepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = 'dpmsolver++'
            new_scheduler.use_karras_sigmas = False
        elif name == "DPM++ 3M Karras":
            new_scheduler = DPMSolverMultistepScheduler \
                .from_config(new_scheduler.config)
            new_scheduler.solver_order = 3
            new_scheduler.algorithm_type = 'dpmsolver++'
            new_scheduler.use_karras_sigmas = True
        elif name == "PNDM":
            new_scheduler = PNDMScheduler \
                .from_config(new_scheduler.config)
        elif name == "IPNDM":
            new_scheduler = IPNDMScheduler \
                .from_config(new_scheduler.config)
        else:
            print(f"[ERROR] Unknown sampling method: {name}")
        # Change scheduler
        self.txt2img.scheduler = new_scheduler
        self.img2img.scheduler = new_scheduler

    def _txt2img_generate(self, state):
        print("[INFO] SDPipes: generate")
        values = state.values
        params = values['params']

        state.write_state("setup_params", {})
        kwargs = {}

        # Check params and generate
        kwargs['width'] = filter_image_size(params['width'])
        kwargs['height'] = filter_image_size(params['height'])
        kwargs['num_inference_steps'] = params['sampling_steps']
        kwargs['guidance_scale'] = params['cfg_scale']

        # Change sampling method
        state.write_state("update_sampler", {})
        self._update_sampling_method(params['sampling_method'])
        
        # Generate
        state.write_state("start_generate", {})
        total_steps = int(params['sampling_steps'])
        def callback(step, timestep, latents):
            state.write_state("txt2img", {
                'step': int(step),
                'total_steps': total_steps,
                'timestep': float(timestep / 1000)
            })
        result = self.txt2img(
            #prompt=self.prompt.text,
            #negative_prompt=self.negative_prompt.text,
            prompt_embeds=self.prompt.embeds,
            negative_prompt_embeds=self.negative_prompt.embeds,
            num_images_per_prompt=1,
            return_dict=True,
            callback=callback,
            **kwargs,
        )
        callback(total_steps, 0, None)

        # If highres,
        highres_fix = params['highres_fix']
        if len(highres_fix) > 0:
            return self._txt2img_highres_fix(
                state,
                result.images[0])

        # Return image
        state.write_state("done", {})
        return result.images[0]

    def _txt2img_highres_fix(self, state, img):
        values = state.values
        params = values['params']
        highres_fix = params['highres_fix']

        for c, hf in enumerate(highres_fix):
            print(f"[INFO] SDPipes: highres_fix - {c}")
            state.write_state("setup_highres_params", {})
            # Get Size
            hf_width = filter_image_size(hf['width'])
            hf_height = filter_image_size(hf['height'])
            # Resize
            img = img.resize((hf_width, hf_height), PIL.Image.LANCZOS)

            kwargs = {}
            kwargs['num_inference_steps'] = params['sampling_steps']
            kwargs['guidance_scale'] = params['cfg_scale']
            kwargs['strength'] = hf['strength']
            
            # Generation
            state.write_state("start_highres_fix", {})
            total_steps = int(params['sampling_steps'] * hf['strength'])
            def callback(step, timestep, latents):
                state.write_state("highres_fix", {
                    'count': c,
                    'step': int(step),
                    'total_steps': total_steps,
                    'timestep': float(timestep / 1000)
                })
            result = self.img2img(
                image=img,
                #prompt=self.prompt.text,
                #negative_prompt=self.negative_prompt.text,
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
        values = state.values
        params = values['params']
        # If model changed, run from reload model
        if self.model_path != f"{state.models_root}/{values['model']['path']}" or \
                self.model_revision != values['model']['revision'] or \
                self.model_variant != values['model']['variant']:
            return self._txt2img_load_model(state)
        # If prompt changed, run from update embedding of model
        if self.prompt.text != params['prompt'] or \
            self.negative_prompt.text != params['negative_prompt']:
            return self._txt2img_update_prompt(state)
        # Otherwise, run from generate
        return self._txt2img_generate(state)
