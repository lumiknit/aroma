let mask = new Uint8Array();

let alert_id = 0;
const appendAlert = (type, message) => {
  alert_id++;
  let html = `
    <div id="a-alert-` + alert_id + `" class="shadow alert alert-` + type + ` alert-dismissible mt-2 fade show" role="alert">
      ` + message + `
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  $('#alert-placeholder').append(html);
  let delay = 5000;
  if(type === "success") {
    delay = 2000;
  }
  setTimeout(() => {
    $('#a-alert-' + alert_id).alert('close');
  }, delay);
};

const formatDate = (date) => {
  let d = new Date(date);
  let y = "00" + d.getFullYear();
  let m = "00" + (d.getMonth() + 1);
  let day = "00" + d.getDate();
  let h = "00" + d.getHours();
  let min = "00" + d.getMinutes();
  let s = "00" + d.getSeconds();
  return y.substr(-2) + m.substr(-2) + day.substr(-2) + " " + h.substr(-2) + ":" + min.substr(-2) + ":" + s.substr(-2);
};

const jsonToHtml = (obj) => {
  let html;
  // Recursively convert to html
  if(typeof obj === "object") {
    // Check is array
    if(Array.isArray(obj)) {
      html = $('<ol>');
      for(let i = 0; i < obj.length; i++) {
        html.append($('<li>').append(jsonToHtml(obj[i])));
      }
    } else {
      html = $('<ul>');
      for(let key in obj) {
        let k = $('<b>').text(key + ": ");
        let li = $('<li>').append(k);
        li.append(jsonToHtml(obj[key]));
        html.append(li);
      }
    }
  } else if(typeof obj === "string") {
    html = $('<span>').text('"' + obj + '"');
  } else {
    html = $('<span>').text(obj);
  }
  return html;
};

// Image Management

let image_map = {};

const createCard = (imgName) => {
  let name = imgName.split(".")[0];
  let html = `
    <div id="card--` + name + `" class="card mt-2">
      <button type="button" class="card-header bg-dark btn btn-sm btn-dark p-1" data-bs-toggle="collapse" data-bs-target="#card-collapse--` + name + `" aria-expanded="false" aria-controls="card-collapse--` + name + `" title="Click to open details"> <div class="text-truncate" style="font-size: 0.5em;">` + name + `</div> </button>
      <a href="javascript:openImageInNewTab('` + name + `')">
        <img id="card-img--` + name + `" class="card-img-top" alt="Not loaded, check password">
      </a>
      <div class="collapse" id="card-collapse--` + name + `">
        <div class="card-body">
          <div id="card-btns--` + name + `">
            <button class="btn btn-sm btn-outline-danger" onclick="deleteImage('` + imgName + `')">Delete</button>
          </div>
          <p class="font-monospace" style="font-size: 0.75em;">
            <small id="card-desc--` + name + `">
            </small>
          </p>
        </div>
      </div>
    </div>
  `;
  return html;
};

const openImageInNewTab = (name) => {
  let img = image_map[name];
  if(img === undefined) {
    console.error("Image may not be pushed: " + name);
    return;
  }
  if(img.a === undefined) {
    console.error("Image data not loaded: " + name);
    appendAlert("danger", "Image Data may not be loaded. Check password: " + name);
    return;
  }
  let url = "data:image/" + img.a.image_format + ";base64," + img.a.image;
  let s = window.open("imgview.html", "_blank");
  s.addEventListener("load", () => {
    s.document.getElementById("image").src = url;
  });
};

const newImageAndCard = (name) => {
  let img = {
    name: name,
    cardID: `card--` + name,
    descID: `card-desc--` + name,
    data: undefined, // Not loaded yet..
  };
  image_map[name] = img;
  return createCard(name);
};

const setupImageData = (name) => {
  let img = image_map[name];
  if(img === undefined) {
    console.error("Image may not be pushed: " + name);
    return;
  }
  let msg = $("#card-msg--" + img.name);
  let img_v = $('#card-img--' + name);
  let desc = $("#" + img.descID);
  img_v.attr("src", undefined);
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
  img_v.attr("src", "data:image/" + img.a.image_format + ";base64," + img.a.image);
  desc.html(jsonToHtml(img.a.values).html());
  $("#card-btns--" + name).prepend($(`<button class="btn btn-sm btn-outline-primary" onclick="reuseImageSettings('` + name + `')"> Reuse </button>`));
};

const loadImageDataByName = (name) => {
  let img = image_map[name];
  if(img === undefined) {
    console.error("Image may not be pushed: " + name);
    return;
  }
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
  let url = "/aroma-static/outputs/" + name + ".a";
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
  for(let name in image_map) {
    loadImageDataByName(name);
  }
};

const reuseImageSettings = (name) => {
  let config = image_map[name].a.values;
  // Set config
  $('#config-model-path').val(config.config.model.path);
  $('#config-sampling-method').val(config.config.params.sampling_method);
  $('#config-sampling-steps').val(config.config.params.sampling_steps);
  $('#config-cfg-scale').val(config.config.params.cfg_scale);
  $('#config-width').val(config.config.params.width);
  $('#config-height').val(config.config.params.height);
  $('#config-prompt').val(config.config.params.prompt);
  $('#config-negative-prompt').val(config.config.params.negative_prompt);
  let cloned = JSON.parse(JSON.stringify(config.config.params));
  delete cloned.sampling_steps;
  delete cloned.cfg_scale;
  delete cloned.width;
  delete cloned.height;
  delete cloned.prompt;
  delete cloned.negative_prompt;
  $('#config-other').val(JSON.stringify(cloned));
  // Make alert
  appendAlert("success", "Settings loaded!");
  // Go to top
  window.scrollTo(0, 0);
};

const deleteImage = (name) => {
  // Get card
  let img = image_map[name];
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
        delete image_map[name];
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
  if(image_map[name] !== undefined) {
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
      let start_time = new Date(data.start_time);
      let elapsed = new Date() - start_time;
      $('#state-started').text(formatDate(start_time));
      $('#state-elapsed').text((elapsed / 1000).toFixed(1) + "s");

      // Load default values
      if(data.values !== undefined) {
        if(data.values.model !== undefined) {
          $('#config-model-path').attr("placeholder", data.values.model.path);
        }
        if(data.values.params !== undefined) {
          let new_text = "Current: " + data.values.params.sampling_method;
          if($('#config-sampling-method-current').text() !== new_text) {
            $('#config-sampling-method-current').text(new_text);
          }
          $('#config-sampling-steps').attr("placeholder", data.values.params.sampling_steps);
          $('#config-cfg-scale').attr("placeholder", data.values.params.cfg_scale);
          $('#config-width').attr("placeholder", data.values.params.width);
          $('#config-height').attr("placeholder", data.values.params.height);
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
      let start_time = new Date(data.start_time);
      let end_time = new Date(data.end_time);
      let elapsed = end_time - start_time;
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
    image_map = {};
  }

  $.get("/api/outputs", (data) => {
    data.forEach((name) => {
      pushImage(name);
      loadImageDataByName(name);
    });
  });
};

const setModel = (model) => {
  $('#config-model-path').val(model);
};

const loadAllModels = () => {
  $.get("/api/models", (data) => {
    // Set dropdown
    let list = $('#models-dropdown-list');
    list.text('');
    data.sort().forEach((model) => {
      list.append($(`<li><a class="dropdown-item" href="#" onclick="setModel('` + model + `')">` + model + `</a></li>`));
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
  // Read sampling method
  let sm = $('#config-sampling-method').val().trim();
  if(sm.length > 0 && sm !== "Default") {
    values.params.sampling_method = sm;
    changed.push("sampling_method");
  }
  // Read sampling steps
  let ss = $('#config-sampling-steps').val().trim();
  if(ss.length > 0) {
    let sampling_steps = parseInt($('#config-sampling-steps').val());
    if(isNaN(sampling_steps) || sampling_steps < 1 || sampling_steps > 1000) {
      appendAlert("danger", "Invalid sampling steps: " + ss);
      return;
    }
    values.params.sampling_steps = sampling_steps;
    changed.push("sampling_steps");
  }
  // Read cfg scale
  let cs = $('#config-cfg-scale').val().trim();
  if(cs.length > 0) {
    let cfg_scale = parseFloat($('#config-cfg-scale').val());
    if(isNaN(cfg_scale) || cfg_scale < 0.1 || cfg_scale > 20) {
      appendAlert("danger", "Invalid cfg scale: " + cs);
      return;
    }
    values.params.cfg_scale = cfg_scale;
    changed.push("cfg_scale");
  }
  // Read width
  let w = $('#config-width').val().trim();
  if(w.length > 0) {
    let width = parseInt($('#config-width').val());
    if(isNaN(width) || width < 1 || width > 10000) {
      appendAlert("danger", "Invalid width: " + w);
      return;
    }
    values.params.width = width;
    changed.push("width");
  }
  // Read height
  let h = $('#config-height').val().trim();
  if(h.length > 0) {
    let height = parseInt($('#config-height').val());
    if(isNaN(height) || height < 1 || height > 10000) {
      appendAlert("danger", "Invalid height: " + h);
      return;
    }
    values.params.height = height;
    changed.push("height");
  }
  // Read prompt
  let p = $('#config-prompt').val().trim();
  if(p.length > 0) {
    values.params.prompt = p;
    changed.push("prompt");
  }
  // Read negative prompt
  let np = $('#config-negative-prompt').val().trim();
  if(np.length > 0) {
    values.params.negative_prompt = np;
    changed.push("negative");
  }
  // Read model path
  let mp = $('#config-model-path').val().trim();
  if(mp.length > 0) {
    values.model.path = mp;
    changed.push("model_path");
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
      $('#config-model-path').val("");
      $('#config-sampling-method').val("Default");
      $('#config-sampling-steps').val("");
      $('#config-cfg-scale').val("");
      $('#config-width').val("");
      $('#config-height').val("");
      $('#config-prompt').val("");
      $('#config-negative-prompt').val("");
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
    '#config-sampling-steps',
    '#config-cfg-scale',
    '#config-width',
    '#config-height',
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
