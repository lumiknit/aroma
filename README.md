# aroma

Note: It's a kind of toy project to test diffusers library and play with img gen on the local device. I have no idea to improve performance/UI/UX yet.

Simple diffuser daemon with utilities and web UI.

This is a user to
- use huggingface/diffusers
- need txt2img loops running on local (especially with MPS)
  - or colab
- with (some naive but maybe useful) features
  - prompt weights as WebUI syntax using `()[](:weight)`
  - multistep highres fix
- and need simple UI

## Usage (Colab)

See aroma.ipynb.

Note that you need ngrok to export web ui. Consider to set basic auth username & password & daemon password not to other person steal your GPU token and images!

## Usage (Local)

### Requirements

- Bash
- Conda/Mamba/Micromamba
- (For web UI) nodejs & npm
- Models for diffusers

### Preparation

- Create `./archives`, `./models`, `./outputs`, `./state` directories
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

### WebUI

![preview](https://raw.githubusercontent.com/lumiknit/aroma/main/ui-preview.webp)

You can
- Turn on/off daemon & see outputs
- Change configuration for next generation
- See images in simple masonry? gallery
- Delete uneccesary images and archive them
- Add archive ddownload page

## Notes

- To use original SD checkpoint, run `python ./convert_original_stable_diffusion_to_diffusers.py --checkpoint_path ./***.safetensors --from_safetensors --to_safetensors --dump_path ./extracted/path --half` with https://github.com/huggingface/diffusers/blob/36f43ea75ab7cdf9b04f72bced0b1ab22036c21c/scripts/convert_original_stable_diffusion_to_diffusers.py

---

## TODO

- When model changed, clean cache on GPU