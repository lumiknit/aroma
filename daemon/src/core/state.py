import datetime
import json
import base64
import gzip
import os
from io import BytesIO


def merge_dict(dst, src):
    for k in src:
        if k in dst and isinstance(dst[k], dict):
            merge_dict(dst[k], src[k])
        else:
            dst[k] = src[k]


def generate_mask(pw):
    # Add salt
    pw = "-<f!-" + pw + "<8z."
    # SHA-512 encode
    import hashlib

    return hashlib.sha512(pw.encode("utf-8")).digest()


def aroma_encode(mask, s):
    # If mask is not provided, use 0x00
    if mask is None:
        mask = b"\x00"
    # Convert string to bytes
    b = bytearray(s, "utf-8")
    # Compress
    b = bytearray(gzip.compress(b))
    # Remove magic number 1f 8b
    b = b[2:]
    # XOR with mask
    l = len(mask)
    last = 0
    for i in range(len(b)):
        b[i] ^= mask[i % l]
        b[i] ^= last
        last = b[i]
    # Encode to base64
    return base64.b64encode(b).decode("utf-8")


def aroma_decode(mask, s):
    # If mask is not provided, use 0x00
    if mask is None:
        mask = b"\x00"
    # Decode base64
    s = bytearray(base64.b64decode(s))
    # XOR with mask
    last = 0
    l = len(mask)
    for i in range(len(s)):
        t = s[i]
        s[i] ^= last
        s[i] ^= mask[i % l]
        last = t
    # Add Magic number 1f 8b
    s = bytearray([0x1F, 0x8B]) + s
    # Decompress
    s = gzip.decompress(s)
    # Convert bytes to string
    return s.decode("utf-8")


class State:
    """
    Global configuration set for daemon
    """

    def __init__(self, d):
        # Get roots
        self.pw = d["password"]
        self.mask = generate_mask(self.pw)
        self.models_root = d["models_root"]
        self.state_root = d["state_root"]
        self.outputs_root = d["outputs_root"]
        self.save_raw = d["save_raw"]
        self.image_format = d["image_format"]

        self.values = d["init_values"]

    @classmethod
    def init_from_config_files(cls, paths):
        d = {}
        for path in paths:
            with open(path, "r") as f:
                merge_dict(d, json.load(f))
        return cls(d)
    
    def merge_current_job(self):
        # Check if current job exists
        p = f"{self.state_root}/current_job.json"
        if not os.path.exists(p):
            return
        # Read current job
        try:
            with open(p, "r") as f:
                job = json.load(f)
                merge_dict(self.values, job["values"])
        except Exception as e:
            print("[WARN] Failed to load current job, do nothing")
            print(e)
            return

    def merge_from_file(self, path):
        # Read file
        with open(path, "r") as f:
            # Read contents
            contents = f.read()
        with open(path, "w") as f:
            # Truncate
            f.write("{}")
        # Merge
        try:
            merge_dict(self.values, json.loads(contents))
        except Exception as e:
            print("[WARN] Failed to merge dict, do nothing")
            print(e)

    def merge_values(self):
        return self.merge_from_file(f"{self.state_root}/values.json")

    def save_values(self, path):
        with open(path, "w") as f:
            f.write(json.dumps(self.values))

    def start_job(self):
        # Set start time
        self.job = {
            "start_time": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "values": self.values,
        }
        # Write to file
        with open(f"{self.state_root}/current_job.json", "w") as f:
            f.write(json.dumps(self.job))

    def end_job(self, img=None):
        # Set end time
        now = datetime.datetime.utcnow()
        self.job["end_time"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        file_prefix = now.strftime("%y%m%d-%H%M%S-%f")
        self.job["filename"] = f"{file_prefix}"
        self.job["image_format"] = f"{self.image_format}"
        # Write to file
        with open(f"{self.state_root}/last_job.json", "w") as f:
            f.write(json.dumps(self.job))
        # If save_raw is enabled, save files to disk
        if self.save_raw:
            img.save(f"{self.outputs_root}/{file_prefix}.{self.image_format}")
            self.save_values(f"{self.outputs_root}/{file_prefix}.json")
        # Write encoded output
        if img is not None:
            # Convert Image into base64 and set to image field
            buffered = BytesIO()
            img.save(buffered, format=self.image_format)
            self.job["image"] = base64.b64encode(buffered.getvalue()).decode("utf-8")
            # Encode
            encoded = aroma_encode(self.mask, json.dumps(self.job))
            # Write
            with open(f"{self.outputs_root}/{file_prefix}.a", "w") as f:
                f.write(encoded)
        # Reset
        self.job = None
        # Return file prefix
        return file_prefix

    def write_state(self, name, values):
        with open(f"{self.state_root}/state.json", "w") as f:
            f.write(
                json.dumps(
                    {
                        "name": name,
                        "values": values,
                    }
                )
            )
