# aroma

![aroma](https://raw.githubusercontent.com/lumiknit/aroma/main/aroma.webp)

Simple diffuser daemon with utilities and web UI.

This is for users who
- use huggingface/diffusers library & models
- need txt2img loops running on local (especially with MPS) or colab need (some naive but maybe useful) features
  - prompt weights as WebUI syntax using `()[](:weight)`
  - multistep highres fix
  - textual inversions
- and need simple UI
  - bootstrap5
  - gallery

## Usage (Colab)

See aroma.ipynb. It'll configurate environment and run WebUI.

Note that you need ngrok to export web ui. Consider to set basic auth username & password & daemon password not to other person steal your GPU token and images!

## Usage (Local)

### Requirements

- Bash
- Micromamba/Mamba/Conda (mamba is recommended)
- (For web UI) nodejs & npm
- Models converted for diffusers library

### Preparation

- Create `./archives`, `./models`, `./outputs`, `./state` directories
  - touch `./state/value.json`
- Link or put SD models in `models` directory
- Modify `config.json` for init configuration
- If you want to launch only daemon, use `./daemon/run.sh`
  - Ìt'll create conda environment and install required packages
  - You can communicate with files in `state` directory
    - `current_job.json`: Current job values & info
    - `last_job.json`: Last job values & info
    - `state.json`: Current state of daemon
    - `values.json`: If you want to change some values, change this file. (JSON format, see config.json init values)
  - All outputs are placed in outputs directory
- To launch UI, prepare npm and run
  - `pushd ui; npm install; popd; node main.js``
  - You can turn on/off daemon in Web UI

## Features

### Daemon

Daemon will automatically run txt2img repeatedly without any rests.
You can communicate with daemon using files in `state` directory.

### WebUI

![preview](https://raw.githubusercontent.com/lumiknit/aroma/main/ui-preview.webp)

You can
- Turn on/off daemon & see outputs
- Change configuration for next generation
- See images in simple masonry? gallery
- Delete uneccesary images and archive them
- Download some models from huggingface.co
- Add archive ddownload page

## Configurations

All default configurations are placed in `default_config.json`. You can overwrite the configuration by writing in `config.json`.

- password: Daemon password
- models_root, state_root, outputs_root, archives_root: Daemon directories. Please create them before run the daemon
- image_format: image format. png/jpeg/webp are tested.
- save_raw: If true, daemon will create not encoded image file and job infromation in output directory. In this case, someone can access the image via webui without password.
- init_values
  - model.path: model path related from models_root
  - params
    - width, height: image size in integer it may be the multiple of 8
    - sampling_method: sampling method, e.g. DPM++ 2M Karras
    - sampling_steps
    - cfg_scale
    - prompt
    - negative_prompt
    - highres_fix: Array of highres fix config
      - scale: Optional, scale of width/height. One of this or width & height must be set.
      - width, height: Optional, New size of image, ONe of this or scale must be set.
      - stregth: Strengh of img2img
- webui
  - host: hostname
  - port: port. If it is 0, use random port
  - model_download_presets: An object of arrays. Key is huggingface repo id, and it's elements are subdirectories. For example, you want to add HF repo "asdf/test-model", put `"asdf/test-model": [""]`. If you want to add HF repo "asdf/zxc" and its subdirectory "model-1", `"asdf/zxc": ["model-1"]`

## Notes

- To use original SD checkpoint, run `python ./convert_original_stable_diffusion_to_diffusers.py --checkpoint_path ./***.safetensors --from_safetensors --to_safetensors --dump_path ./extracted/path --half` with https://github.com/huggingface/diffusers/blob/36f43ea75ab7cdf9b04f72bced0b1ab22036c21c/scripts/convert_original_stable_diffusion_to_diffusers.py

---

## TODO

- When reopen window, load all generated images
- Random weighted prompt
- Fix model download UIs
- Save password in localstorage
