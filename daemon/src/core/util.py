from packaging.version import Version
import torch


def torch_device():
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"


def is_torch_2_0():
    torch_version = Version(torch.__version__)
    criterion = Version("2.0")
    return torch_version >= criterion
