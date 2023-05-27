// Encoding helper variable
let mask = new Uint8Array();

// -- Image Management

// Loaded image map
let imageMap = {};

const imageCardHTML = (imgName) => {
  let name = imgName.split(".")[0];
  let html = `
    <div id="card--${name}" class="card mt-2">
      <button type="button" class="card-header bg-dark btn btn-sm btn-dark p-1" data-bs-toggle="collapse" data-bs-target="#card-collapse--${name}" aria-expanded="false" aria-controls="card-collapse--${name}" title="Click to open details"> <div class="text-truncate" style="font-size: 0.5em;">${name}</div> </button>
      <a href="javascript:openImageInNewTab('${name}')">
        <img id="card-img--${name}" class="card-img-top" alt="Not loaded, check password">
      </a>
      <div class="collapse" id="card-collapse--${name}">
        <div class="card-body">
          <div id="card-btns--${name}">
            <button class="btn btn-sm btn-outline-danger" onclick="deleteImage('${imgName}')">Delete</button>
          </div>
          <p class="font-monospace" style="font-size: 0.75em;">
            <small id="card-desc--${name}"> </small>
          </p>
        </div>
      </div>
    </div>
  `;
  return html;
};

const getImage = (name) => {
  let img = imageMap[name];
  if(img === undefined) {
    console.error("Image may not be pushed: " + name);
    return;
  }
  return img;
};

const getImageData = (name) => {
  let img = getImage(name);
  if(img.a === undefined) {
    console.error("Image data not loaded: " + name);
    appendAlert("danger", "Image Data may not be loaded. Check password: " + name);
    return;
  }
  return img.a;
};

const getImageSource = (name) => {
  let data = getImageData(name);
  return `data:image/${data.image_format};base64,${data.image}`;
};

const openImageInNewTab = (name) => {
  let src = getImageSource(name);
  let s = window.open("imgview.html", "_blank");
  s.addEventListener("load", () => {
    s.document.getElementById("image").src = src;
  });
};

const newImageAndCard = (name) => {
  let img = {
    name: name,
    cardID: `card--${name}`,
    descID: `card-desc--${name}`,
    data: undefined, // Not loaded yet..
  };
  imageMap[name] = img;
  return imageCardHTML(name);
};

const setupImageData = (name) => {
  let img = getImage(name);
  let msg = $(`#card-msg--${img.name}`);
  let imgV = $(`#card-img--${name}`);
  let desc = $(`#${img.descID}`);
  imgV.attr("src", undefined);
  desc.text("");
  msg.text("");
  if(img.data === undefined) {
    console.error("Image data not loaded: " + name);
    msg.text("Data not loaded. It may not exist");
    return;
  }
  // Try to decode file
  let decoded = aromaDecode(mask, img.data);
  if(typeof decoded !== "string") {
    msg.text("Failed to decode data. Check password");
    console.error("Cannot decode image: " + name);
    return;
  }
  // The data is json, unmarshal
  let parsed = JSON.parse(decoded);
  if(typeof parsed !== "object") {
    msg.text("Failed to parse json. Check password");
    console.error("Cannot parse image: " + name);
    return;
  }
  img.a = JSON.parse(decoded);
  // Update card
  imgV.attr("src", `data:image/${img.a.image_format};base64,${img.a.image}`);
  desc.html(jsonToHtml(img.a.values).html());
  $("#card-btns--" + name).prepend($(`<button class="btn btn-sm btn-outline-primary" onclick="reuseImageSettings('${name}')"> Reuse </button>`));
};

const loadImageDataByName = (name) => {
  let img = getImage(name);
  if(img.a !== undefined) {
    // Already done.
    return;
  }
  if(img.data !== undefined) {
    // Data already downloded
    // Setup with the data
    setupImageData(name);
    return;
  }
  let desc = $("#" + img.descID);
  let url = `/aroma-static/outputs/${name}.a`;
  $.ajax({
    url: url,
    type: "GET",
    dataType: "text",
    async: true,
    success: (data) => {
      img.data = data;
      setupImageData(name);
    },
    error: (xhr, status, error) => {
      desc.text("Error: " + error);
    }
  });
};

const reloadAllImageData = () => {
  for(let name in imageMap) {
    loadImageDataByName(name);
  }
};

const reuseImageSettings = (name) => {
  let config = imageMap[name].a.values;
  // Set config
  $('#config-model-path').val(config.config.model.path);
  $('#config-lora-path').val(config.config.model.lora_path);
  $('#config-clip-skip').val(config.config.model.clip_skip);
  $('#config-lora-alpha').val(config.config.model.lora_alpha);
  const paramsList = {
    "sampling_method": "sampling-method",
    "sampling_steps": "sampling-steps",
    "cfg_scale": "cfg-scale",
    "width": "width",
    "height": "height",
    "seed": "seed",
    "size_range": "size-range",
    "prompt": "prompt",
    "negative_prompt": "negative-prompt",
  };
  for(let p in paramsList) {
    // Convert hypen
    let id = "#config-" + paramsList[p];
    $(id).val(config.config.params[p]);
  }
  let cloned = JSON.parse(JSON.stringify(config.config.params));
  for(let p in paramsList) {
    delete cloned[p];
  }
  $('#config-other').val(JSON.stringify(cloned));
  // Make alert
  appendAlert("success", "Settings loaded!");
  // Go to top
  window.scrollTo(0, 0);
};

const deleteImage = (name) => {
  // Get card
  let img = imageMap[name];
  if(img === undefined) {
    console.error("Image may not be pushed: " + name);
    return;
  }
  // Create dialog to confirm deletion
  if(confirm("Delete image and settings of the file named: " + name)) {
    // Send delete request
    $.ajax({
      url: "/api/outputs/" + name,
      type: "DELETE",
      async: true,
      success: (data) => {
        $(`#card--` + name).remove();
        delete imageMap[name];
      }
    });
  }
};

const galleryColumn = (index) => {
  if(index < 0 || index > 2) {
    console.error("[ERROR] Invalid index: " + index);
    return null;
  }
  return $("#gallery-col-" + index);
};

const resetColumn = (index) => {
  let column = galleryColumn(index);
  column.empty();
};

const imageNameRegExp = new RegExp("^[a-zA-Z0-9_\\-\\.]+$");
const pushImage = (name) => {
  // Check if image is already in gallery
  if(imageMap[name] !== undefined) {
    return false;
  }
  // Check image name is valid
  if(typeof name !== "string" || !imageNameRegExp.test(name)) {
    console.error("[ERROR] Invalid image name: " + name);
    return false;
  }
  // Find column with least cards
  let minCol = 0;
  for(var i = 1; i < 3; i++) {
    let col_i = galleryColumn(i);
    let col_m = galleryColumn(minCol);
    if(col_i.height() < col_m.height() || (col_i.height() == col_m.height() && col_i.children().length < col_m.children().length)) {
      minCol = i;
    }
  }
  // Push card to column
  let html = newImageAndCard(name);
  let column = galleryColumn(minCol);
  column.prepend(html);
  return true;
};

const updatePWIndicator = (passed) => {
  let indicator = $('#pw-indicator');
  let marker = indicator.text().trim()
  if(passed && marker === "X") {
    indicator.removeClass('bg-danger');
    indicator.addClass('bg-success');
    indicator.text("O");
  } else if(!passed && marker === "O") {
    indicator.removeClass('bg-success');
    indicator.addClass('bg-danger');
    indicator.text("X");
  }
};

const reload = () => {
  if(!document.hidden) {
    // Load current state
    $.get("/aroma-static/state/state.json", (data) => {
      try {
        data = JSON.parse(aromaDecode(mask, data));
        updatePWIndicator(true);
      } catch(e) {
        // Maybe password failed
        updatePWIndicator(false);
        return;
      }
      let status = $('#state-status');
      status.text(data.name);
      const statusColor = {
        "load_model": "danger",
        "update_prompt": "warning",
        "txt2img": "primary",
        "highres_fix": "primary",
        "img2img": "primary",
        "done": "success",
        "save_image": "info",
        "error": "danger",
      };
      status.removeClass("bg-danger bg-warning bg-primary bg-info bg-secondary bg-success");
      let color = statusColor[data.name];
      if(!color) {
        color = "secondary";
      }
      status.addClass("bg-" + color);
      $('#state-details').text(JSON.stringify(data.values));
      // Check it is progress
      let progress = $('#state-progress');
      if(typeof data.values.step === "number"
          && typeof data.values.total_steps === "number") {
        // Update progress bar
        percentage = 100 * data.values.step / data.values.total_steps;
        text = "" + data.values.step + "/" + data.values.total_steps;
        progress.addClass("progress-bar-striped progress-bar-animated");
        progress.css("width", percentage + "%").text(text);
      } else {
        // Set to full progress
        progress.removeClass("progress-bar-striped progress-bar-animated");
        progress
          .css("width", "100%")
          .text("--/--");
      }
    });
    // Load current job
    $.get("/aroma-static/state/current_job.json", (data) => {
      try {
        data = JSON.parse(aromaDecode(mask, data));
        updatePWIndicator(true);
      } catch(e) {
        // Maybe password failed
        return;
      }
      let startTime = new Date(data.start_time);
      let elapsed = new Date() - startTime;
      $('#state-started').text(formatDate(startTime));
      $('#state-elapsed').text((elapsed / 1000).toFixed(1) + "s");

      // Load default values
      if(data.values !== undefined) {
        if(data.values.model !== undefined) {
          $('#config-model-path').attr("placeholder", data.values.model.path);
          $('#config-lora-path').attr("placeholder", data.values.model.lora_path);
          $('#config-clip-skip').attr("placeholder", data.values.model.clip_skip);
        }
        if(data.values.params !== undefined) {
          let new_text = "Current: " + data.values.params.sampling_method;
          $('#config-lora-alpha').attr("placeholder", data.values.model.lora_alpha);
          if($('#config-sampling-method-current').text() !== new_text) {
            $('#config-sampling-method-current').text(new_text);
          }
          $('#config-sampling-steps').attr("placeholder", data.values.params.sampling_steps);
          $('#config-cfg-scale').attr("placeholder", data.values.params.cfg_scale);
          $('#config-width').attr("placeholder", data.values.params.width);
          $('#config-height').attr("placeholder", data.values.params.height);
          $('#config-seed').attr("placeholder", data.values.params.seed);
          $('#config-size-range').attr("placeholder", data.values.params.size_range);
          $('#config-prompt').attr("placeholder", data.values.params.prompt);
          $('#config-negative-prompt').attr("placeholder", data.values.params.negative_prompt);
          let cloned = JSON.parse(JSON.stringify(data.values.params));
          delete cloned.sampling_method;
          delete cloned.sampling_steps;
          delete cloned.cfg_scale;
          delete cloned.width;
          delete cloned.height;
          delete cloned.prompt;
          delete cloned.negative_prompt;
          delete cloned.seed;
          delete cloned.size_range;
          $('#config-other').attr("placeholder", JSON.stringify(cloned));
        }
      }
    });
    // Load last job
    // It must be run in background because it'll add image to gallery
    $.get("/aroma-static/state/last_job.json", (data) => {
      try {
        data = JSON.parse(aromaDecode(mask, data));
        updatePWIndicator(true);
      } catch(e) {
        // Maybe password failed
        updatePWIndicator(false);
        return;
      }
      let startTime = new Date(data.start_time);
      let endTime = new Date(data.end_time);
      let elapsed = endTime - startTime;
      $('#state-last-elapsed').text((elapsed / 1000).toFixed(1) + "s");
      let filename = data.filename;
      $('#state-last-file').text(filename);
      pushImage(filename);
      loadImageDataByName(filename);
    });
  }
};

const loadAllGallery = (clear) => {
  if(clear) {
    for(var i = 0; i < 3; i++) {
      resetColumn(i);
    }
    imageMap = {};
  }

  $.get("/api/outputs", (data) => {
    data.forEach((name) => {
      pushImage(name);
      loadImageDataByName(name);
    });
  });
};

const setModelValue = (model) => {
  $('#config-model-path').val(model);
};

const loadAllModels = () => {
  $.get("/api/models", (data) => {
    // Set dropdown
    let list = $('#models-dropdown-list');
    list.text('');
    data.sort().forEach((model) => {
      list.append($(`<li><a class="dropdown-item" href="#" onclick="setModelValue('${model}')">${model}</a></li>`));
    });
  });
};

const setLoraValue = (model) => {
  if(model === undefined) {
    $('#config-lora-path').val('-');
  } else {
    $('#config-lora-path').val(model);
  }
};

const loadAllLoras = () => {
  $.get("/api/loras", (data) => {
    // Set dropdown
    let list = $('#loras-dropdown-list');
    list.text('');
    list.append($(`<li><a class="dropdown-item" href="#" onclick="setLoraValue(undefined)"> NONE </a></li>`));
    data.sort().forEach((model) => {
      list.append($(`<li><a class="dropdown-item" href="#" onclick="setLoraValue('${model}')">${model}</a></li>`));
    });
  });
};

const applyConfig = () => {
  // Read other config
  let values = {
    model: {},
    params: {}
  };
  let changed = [];
  try {
    let text = $('#config-other').val().trim();
    if(text.length > 0) {
      values.params = JSON.parse($('#config-other').val());
    }
  } catch(e) {
    appendAlert("danger", "Invalid other config: " + e);
    return;
  }
  // Value parser
  let parse = {
    'clip-skip': {
      dest: ['model', 'clip_skip'],
      type: 'float',
      min: 0,
      max: 10,
    },
    'lora-alpha': {
      dest: ['model', 'lora_alpha'],
      type: 'float',
      min: -10.0,
      max: 10.0,
    },
    'sampling-method': {
      dest: ['params', 'sampling_method'],
      type: 'string',
      ignore: 'Default',
    },
    'sampling-steps': {
      dest: ['params', 'sampling_steps'],
      type: 'int',
      min: 1,
      max: 100,
    },
    'cfg-scale': {
      dest: ['params', 'cfg_scale'],
      type: 'float',
      min: 0.0,
      max: 100.0,
    },
    'width': {
      dest: ['params', 'width'],
      type: 'int',
      min: 1,
      max: 10000,
    },
    'height': {
      dest: ['params', 'height'],
      type: 'int',
      min: 1,
      max: 10000,
    },
    'seed': {
      dest: ['params', 'seed'],
      type: 'string',
    },
    'size-range': {
      dest: ['params', 'size_range'],
      type: 'float',
      min: 0.0,
      max: 1.0,
    },
    'prompt': {
      dest: ['params', 'prompt'],
      type: 'string',
    },
    'negative-prompt': {
      dest: ['params', 'negative_prompt'],
      type: 'string',
    },
    'model-path': {
      dest: ['model', 'path'],
      type: 'string',
    },
    'lora-path': {
      dest: ['model', 'lora_path'],
      type: 'string',
    },
  };
  for(let key in parse) {
    let p = parse[key];
    let val = $('#config-' + key).val().trim();
    if(val.length === 0) continue;
    switch(p.type) {
    case 'float': {
      let fval = parseFloat(val);
      if(isNaN(fval) || fval < p.min || fval > p.max) {
        appendAlert("danger", "Invalid float value: " + val);
        return;
      }
      values[p.dest[0]][p.dest[1]] = fval;
      changed.push(p.dest[1]);
    }; break;
    case 'int': {
      let ival = parseInt(val);
      if(isNaN(ival) || ival < p.min || ival > p.max) {
        appendAlert("danger", "Invalid int value: " + val);
        return;
      }
      values[p.dest[0]][p.dest[1]] = ival;
      changed.push(p.dest[1]);
    }; break;
    case 'string': {
      if(val == '-') {
        // Empty mark
        values[p.dest[0]][p.dest[1]] = "";
        changed.push(p.dest[1]);
      } else if(val !== p.ignore) {
        values[p.dest[0]][p.dest[1]] = val;
        changed.push(p.dest[1]);
      }
    }; break;
    }
  }
  // Encode
  let encoded = JSON.stringify(values);
  encoded = aromaEncode(mask, encoded);
  // Send request
  $.ajax({
    url: "/api/values",
    type: "PUT",
    data: encoded,
    contentType: "application/json",
    async: true,
    success: (data) => {
      // Reset all fields
      // Make value empty for all above ids
      for(let key in parse) {
        $('#config-' + key).val("");
      }
      $('#config-sampling-method').val("Default");
      $('#config-other').val("");
      appendAlert("success", "Updated successfully: " + changed.join(", "));
    },
    error: (xhr, status, error) => {
      appendAlert("danger", "Update request failed: " + error);
    }
  });
};

// Daemon APIs
const updateDaemonStatus = () => {
  let btnStatus = $('#btn-daemon-status');
  let btnSwitch = $('#btn-daemon-switch');
  // Call API
  $.get("/api/daemon", (data) => {
    if(data === "running") {
      btnStatus.removeClass("btn-outline-danger");
      btnStatus.addClass("btn-outline-success");
      btnSwitch.removeClass("btn-danger");
      btnSwitch.addClass("btn-success");
      btnSwitch.text("Off");
    } else {
      btnStatus.removeClass("btn-outline-success");
      btnStatus.addClass("btn-outline-danger");
      btnSwitch.removeClass("btn-success");
      btnSwitch.addClass("btn-danger");
      btnSwitch.text("On");
    }
  });
};

const switchDaemonStatus = () => {
  // Toggle daemon status
  if(confirm("Switch daemon status?")) {
    $.ajax({
      url: "/api/daemon",
      type: "PUT",
      async: true,
      success: (data) => {
        updateDaemonStatus();
      },
      error: (xhr, status, error) => {
        appendAlert("danger", "Daemon switch failed: " + error);
      }
    });
  }
};

// Password
const updatePassword = (showAlert) => {
  let pw = $('#text-pw').val();
  let l = pw.length;
  // Change placeholder
  $('#text-pw').attr("placeholder", "*".repeat(pw.length));
  // Reset field
  $('#text-pw').val("");
  // Add salt
  mask = makeMask(pw);
  // Make alert
  if(showAlert !== false) {
    appendAlert("success", "Password applied & Reload all images");
  }
  reloadAllImageData();
};

const setUpEventHandlers = () => {
  const textboxes = [
    '#config-clip-skip',
    '#config-lora-alpha',
    '#config-sampling-steps',
    '#config-cfg-scale',
    '#config-width',
    '#config-height',
    '#config-seed',
    '#config-size-range',
    '#config-prompt',
    '#config-negative-prompt',
    '#config-other'
  ];
  // Set event handler
  for(let tb of textboxes) {
    ((id) => {
      $(id).on('focus', () => {
        c = $(id);
        if(c.val() == "") {
          c.val(c.attr("placeholder"));
        }
      });
      $(id).on('blur', () => {
        c = $(id);
        if(c.val() == c.attr("placeholder")) {
          c.val("");
        }
      });
    })(tb);
  }
  $('#text-pw').on('keyup', (e) => {
    if(e.keyCode == 13) {
      updatePassword();
    }
  });
};

// Init
$(() => {
  // Set prompt loader
  setUpEventHandlers();
  // Init password
  updatePassword(false);
  // Load models
  loadAllModels();
  loadAllLoras();
  // Load gallery
  loadAllGallery();
  // Create interval to reload gallery
  setInterval(() => {
    reload();
    updateDaemonStatus();
  }, 401);
  document.addEventListener('visibilitychange', (e) => {
    if(!document.hidden) {
      // Try to reload all images
      loadAllGallery();
    }
  });

  // Set QR
  $('#qr-link').attr("href", "qr.html?text=" + encodeURI(window.location.href));
});
