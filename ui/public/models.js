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
const presets = {
  "lumiknit/diffusers-model-archive": [
    "AOM3_orangemixs",
    "Counterfeit-V2.2",
    "Counterfeit-V2.5",
    "Counterfeit-V3.0",
    "anything-v4.5",
    "bra-v5",
    "chickmixflat-v1-0",
    "chilloutmix_NiPruned",
    "darkSushiMix_colorful",
    "forgottenmix_v10",
    "hassaku_v12",
    "kanpiromix_v20",
    "kuronekoAnimemix_v10",
    "majicmixRealistic_v4",
    "meinapastel_v5",
    "meinaunreal_v3",
    "mixProV4",
    "niji3dstyle-v1",
    "perfectWorld_v4",
    "profantasy_v22",
    "realisian_v20",
    "realisian_v40",
    "tauronHybridReal_v21",
    "textual_inversions",
  ],
};

const loadPresets = () => {
  const tbody = $('#preset-tbody');
  tbody.text('');
  let idx = 1;
  for(let repoID in presets) {
    for(let model of presets[repoID]) {
      let flag = false;
      for(let existing of models) {
        if(existing.indexOf(model) != -1) {
          flag = true;
          break;
        }
      }
      if(!flag) {
        tbody.append(`<tr><th scope="row">${idx}</th><td>${repoID}</td><td>${model}</td><td><button class="btn btn-primary" onclick="downloadModel('${repoID}', '${model}')">Download</button></td></tr>`);
      }
      idx += 1;
    }
  }
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
      log.text(out);
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
