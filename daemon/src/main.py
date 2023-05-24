import time
import traceback
import sys

from core.state import State
from core.pipes import SDPipes

state = State.init_from_config_files(
    [
        "default_config.json",
        "config.json",
    ]
)
state.merge_current_job()


pipes = SDPipes()


if __name__ == "__main__":
    # Main Loop
    i = 0
    while True:
        try:
            print(f"[NOTE] --- Iter {i}")
            start = time.time()
            # Merge values
            state.merge_values()
            state.start_job()
            # Run text to image
            img = pipes.text_to_image(state)
            file_prefix = state.end_job(img)
            # Prepare for next iteration
            end = time.time()
            print(f"[INFO] --- Iter {i}: elapsed: {end - start} sec")
            i += 1
        except Exception as e:
            print(f"[ERROR] Exception occurred: {e}")
            # print(traceback.format_exc())
            print("[ERROR] Sleep a second and retry")
            state.write_state("error", str(e))
            time.sleep(1)
