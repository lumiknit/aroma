import time

from core.state import State
from core.pipes import SDPipes

state = State.init_from_config_files(
    [
        "default_config.json",
        "config.json",
    ]
)

pipes = SDPipes()


if __name__ == "__main__":
    # Main Loop
    i = 0
    while True:
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
