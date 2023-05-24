import sys

from huggingface_hub import snapshot_download


def main():
    if len(sys.argv) < 3:
        print(f"Usage: python {sys.argv[0]} <output_dir> <hf_repo_id> [<repo_subdir>]")
        sys.exit(1)

    output_dir = sys.argv[1]
    hf_repo_id = sys.argv[2]

    allow_patterns = None
    if len(sys.argv) > 3 and sys.argv[3] != "":
        allow_patterns = [f"{sys.argv[3]}/*"]

    print(f"[INFO] output_dir = {output_dir}")
    print(f"[INFO] hf_repo_id = {hf_repo_id}")
    print(f"[INFO] allow_patterns = {allow_patterns}")

    snapshot_download(
        hf_repo_id,
        local_dir=output_dir,
        resume_download=True,
        allow_patterns=allow_patterns,
    )

    print(f"[INFO] Done!")

if __name__ == "__main__": main()
