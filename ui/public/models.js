const appendAlert = (type, message) => {
  let html = `
    <div class="shadow alert alert-` + type + ` alert-dismissible mt-2 fade show" role="alert">
      ` + message + `
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  $('#alert-placeholder').append(html);
};

let models = [];
let presets = {};

const loadPresets = () => {
  const tbody = $('#preset-tbody');
  tbody.text('');
  let idx = 1;
  // Get to /api/download-model-presets
  $.get("/api/download-model-presets", (data) => {
    // Parse json
    presets = data;
    console.log(presets);
    for(let repoID in presets) {
      for(let model of presets[repoID]) {
        let flag = false;
        if(model !== '') {
          for(let existing of models) {
            if(existing.indexOf(model) != -1) {
              flag = true;
              break;
            }
          }
        }
        if(!flag) {
          tbody.append(`<tr><th scope="row">${idx}</th><td>${repoID}<br>${model}</td><td><button class="btn btn-primary" onclick="downloadModel('${repoID}', '${model}')">Download</button></td></tr>`);
          idx += 1;
        }
      }
    }
  });
};

const loadAllModelsAndPresets = () => {
  $.get("/api/models", (data) => {
    // Set dropdown
    let list = $('#model-list');
    list.text('');
    data.sort().forEach((model) => {
      list.append($(`<div class="card col-6 col-sm-4 col-md-3 col-lg-2"><div class="card-body p-1">` + model + `</div></div>`));
    });
    // Set global var
    models = data;
    loadPresets();
  });
};

const downloadClick = () => {
  let repoID = $('#dl-model-repo-id').val();
  let subDir = $('#dl-model-subdir').val();
  return downloadModel(repoID, subDir);
};

const downloadModel = (repoID, subdir) => {
  // POST to /api/download-model
  $.post("/api/download-model", JSON.stringify({
    repo_id: repoID,
    subdir: subdir,
  }), (data) => {
    console.log(data);
    appendAlert('info', `Downloading ${repoID}:${subdir}...`);
  });
};

const updateDownloadStatus = () => {
  // GET from /api/download-model
  $.get("/api/download-model", (data) => {
    // Parse json
    data = JSON.parse(data);
    // Set dropdown
    let list = $('#download-tbody');
    list.text('');
    data.forEach((model) => {
      const repo_id = model.repo_id;
      const subdir = model.subdir;
      const out = model.out;
      let tr = $(`<tr></tr>`);
      tr.append(`<td>${repo_id}</td>`);
      tr.append(`<td>${subdir}</td>`);
      let log = $(`<pre></pre>`);
      log.text(out.split("\n").map((x) => x.trim()).slice(-2).join("\n"));
      let td = $(`<td></td>`);
      td.append(log);
      tr.append(td);
      list.append(tr);
    });
  });
};

const reload = () => {
  updateDownloadStatus();
};

$(() => {
  // Load models
  loadAllModelsAndPresets();

  setInterval(() => {
    reload();
  }, 1000);
});
