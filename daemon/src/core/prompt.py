from diffusers.loaders import TextualInversionLoaderMixin
import torch

from .util import torch_device, is_torch_2_0

"""
Prompt Grammer

(<prompts>:<weight>), [<prompts>:<weight>] -> weighted by weight
(<prompts>) -> weighted by 1.1
[<prompts>] -> weighted by 0.9
"""
def text_to_weighted_list(text):
    weight_factor = 1.0
    if not isinstance(text, str):
        raise Exception("Invalid text (expect str)")
    chunks = [("", 1.0)]
    stack = []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '(':
            stack.append((len(chunks), 1 + 0.1 * weight_factor))
            chunks.append(("", 1.0))
        elif c == '[':
            stack.append((len(chunks), 1 - 0.1 * weight_factor))
            chunks.append(("", 1.0))
        elif c == ')' or c == ']':
            if len(stack) > 0:
                idx, weight = stack.pop()
                for j in range(idx, len(chunks)):
                    chunks[j] = (chunks[j][0], chunks[j][1] * weight)
            chunks.append(("", 1.0))
        elif c == ':':
            # Parse weight (float)
            j = i + 1
            num = ""
            c = text[j]
            while j < len(text) and (c <= ' ' or c == '.' or c.isdigit()):
                num += c
                j += 1
                c = text[j]
            i = j - 1
            try:
                weight = 1 + (float(num) - 1) * weight_factor
                if len(stack) > 0:
                    stack[-1] = (stack[-1][0], weight)
            except:
                print(f"[WARN] Failed to parse weight: {num}, ignore it")
        else:
            chunks[-1] = (chunks[-1][0] + c, chunks[-1][1])
        i += 1
    # Filter empyties
    chunks = [chunk for chunk in chunks if len(chunk[0]) > 0]
    # Make weights at least 0.01
    for i in range(len(chunks)):
        chunks[i] = (chunks[i][0], max(chunks[i][1], 0.01))
    # Generate sentences list
    sentences = []
    weights = []
    while len(chunks) > 0:
        # Find minimum weight
        min_weight = float('inf')
        for i in range(len(chunks)): min_weight = min(min_weight, chunks[i][1])
        # Create sentence with the weight
        sentence = ""
        for i in range(len(chunks)):
            sentence += chunks[i][0] + " "
            chunks[i] = (chunks[i][0], chunks[i][1] - min_weight)
        # Append to list
        sentences.append(sentence)
        weights.append(min_weight)
        # Remove about zero weight chunks
        chunks = [chunk for chunk in chunks if chunk[1] >= 0.001]
    return sentences, weights

class Prompt:
    def __init__(self, text):
        self.text = text
        self.embeds = None

    def update_embed(self, text, txt2img):
        device = torch_device()

        # Check text type
        if not isinstance(text, str):
            raise Exception("Invalid text (expect str)")
        
        # Check if text is the same. If so, use cached one
        if self.text == text: return

        # Try to convert prompt
        if isinstance(txt2img, TextualInversionLoaderMixin):
            text = txt2img.maybe_convert_prompt(text, txt2img.tokenizer)

        # Convert to weighted list
        sentences, weights = text_to_weighted_list(text)
        text_inputs = txt2img.tokenizer(
            sentences,
            padding="max_length",
            max_length=txt2img.tokenizer.model_max_length,
            truncation=True,
            return_tensors="pt",
        )
        text_input_ids = text_inputs.input_ids

        # Put empty tokens to result
        empty_token_ids = torch.tensor(
            [txt2img.tokenizer.bos_token_id] +
            [txt2img.tokenizer.eos_token_id] +
            [txt2img.tokenizer.pad_token_id] * (text_input_ids.shape[1] - 2),
            dtype=torch.int,
            device=device,
        ).unsqueeze(0)
        token_tensors = torch.cat(
            [empty_token_ids, text_input_ids.to(device)],
            dim=0)

        if hasattr(txt2img.text_encoder.config, "use_attention_mask") \
                and txt2img.text_encoder.config.use_attention_mask:
            attention_mask = text_inputs.attention_mask.to(device)
        else:
            attention_mask = None

        embeds = txt2img.text_encoder(
            token_tensors,
            attention_mask=attention_mask,
        )[0]
        
        empty_e = embeds[:1]
        text_e = embeds[1:]

        # Accumulate weightes
        embeds = empty_e
        for i in range(len(sentences)):
            embeds += (text_e[i:i+1] - embeds) * weights[i]

        self.text = text
        self.embeds = embeds
