// Load modeuls

const child_process = require('child_process');
const fs = require('fs');
const express = require('express');
const path = require('path');
const process = require('process');

const enc = require(path.resolve( __dirname, "./public/js/enc.js" ));
console.log(enc.aromaEncode(enc.makeMask("test"), "abc"));

// Helpers

const mergeObject = (dst, src) => {
  // Merge src into dst
  for(let key in src) {
    // If value is an object, merge recursively
    if(typeof src[key] == "object" && !Array.isArray(src[key])) {
      if(typeof dst[key] != "object" || Array.isArray(dst[key])) {
        dst[key] = {};
      }
      mergeObject(dst[key], src[key]);
      continue;
    }
    dst[key] = src[key];
  }
  return dst;
};

const currentDateInFormat = () => {
  // Return now as a format yymmdd-hhmmss
  let now = new Date();
  let year = ("00" + now.getFullYear()).slice(-2);
  let month = ("00" + now.getMonth()).slice(-2);
  let date = ("00" + now.getDate()).slice(-2);
  let hour = ("00" + now.getHours()).slice(-2);
  let min = ("00" + now.getMinutes()).slice(-2);
  let sec = ("00" + now.getSeconds()).slice(-2);
  return year + "" + month + "" + date + "-" + hour + "" + min + "" + sec;
};

// -- Initialization
// Move to script path
(() => {
  let base = __dirname;
  process.chdir(base + "/..");
})();
console.log("[NOTE] Current directory: " + process.cwd());

// Read config.json
console.log("[INFO] Reading config.json...");
const defaultConfigJson = fs.readFileSync('default_config.json', 'utf8');
const defaultConfig = JSON.parse(defaultConfigJson);

const configJson = fs.readFileSync('config.json', 'utf8');
const config = mergeObject(defaultConfig, JSON.parse(configJson));

const modelsPath = config.models_root;
const outputsPath = config.outputs_root;
const statePath = config.state_root;
const archivesPath = config.archives_root;

console.log("[NOTE] Paths:");
console.log("       - models_path: " + modelsPath);
console.log("       - outputs_path: " + outputsPath);
console.log("       - state_path: " + statePath);
console.log("       - archives_path: " + archivesPath);

const webuiHost = config.webui.host;
const webuiPort = config.webui.port;
const webuiModelDownloadPresets = config.webui.model_download_presets;

const daemonPassword = config.password;
const mask = enc.makeMask(daemonPassword);

// Create each directory if not exists
const createDirIfNotExists = (dir) => {
  if(!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
};
createDirIfNotExists(modelsPath);
createDirIfNotExists(outputsPath);
createDirIfNotExists(statePath);
createDirIfNotExists(archivesPath);


// --- Create express.js app
const app = express();

// - Static files
app.use('/aroma-static/archives/', express.static(archivesPath));
app.use('/aroma-static/outputs', express.static(outputsPath));
app.use('/static', express.static(__dirname + "/public"));

// Status
app.get('/aroma-static/state/:filename', async (req, res) => {
  let filename = req.params.filename;
  let fullpath = statePath + "/" + filename;
  if(!fs.existsSync(fullpath)) {
    res.status(404).send("Not found");
    return;
  }
  let data = await fs.promises.readFile(fullpath);
  // Encode
  let encoded = enc.aromaEncode(mask, data);
  res.send(encoded);
});

// - APIs

// Set index page
const indexHandler = (req, res) => {
  res.redirect('/static/index.html');
};
app.get('/', indexHandler);
app.get('/home', indexHandler);
app.get('/index', indexHandler);
app.get('/index.html', indexHandler);

// Get archive list
app.get('/api/archives', (req, res) => {
  res.set('Cache-Control', 'no-store');
  fs.readdir(archivesPath, (err, files) => {
    res.send(files);
  });
});

// Get output list
app.get('/api/outputs', (req, res) => {
  res.set('Cache-Control', 'no-store');
  fs.readdir(outputsPath, (err, files) => {
    let a = [];
    for(let file of files) {
      let ext = path.extname(file);
      if(ext === ".a") {
        a.push(file.substring(0, file.lastIndexOf(".")));
      }
    }
    res.send(a);
  });
});

const traverseModels = async (result, dir) => {
  // Read directory
  let files = await fs.promises.readdir(dir);
  // Check the directory is model
  if(files.indexOf("model_index.json") != -1) {
    result.push(dir);
    return;
  }
  // Otherwise traverse
  for(let file of files) {
    let fullpath = dir + "/" + file;
    let stat = await fs.promises.stat(fullpath);
    if(stat.isDirectory()) {
      await traverseModels(result, fullpath);
    }
  }
};

app.get('/api/models', async (req, res) => {
  // Return all diffusers models in models output
  // It'll return only subpath from models_path, 
  let result = [];
  await traverseModels(result, modelsPath);
  res.send(result.map((path) => {
    return path.replace(modelsPath + "/", "");
  }));
});

const traverseLoras = async (result, base, dir) => {
  // Is lora directory?
  let isLoraDir = dir.toLowerCase().indexOf("lora") != -1;
  let files;
  try {
    files = await fs.promises.readdir(base + "/" + dir);
  } catch(e) {
    console.log("Failed to readdir: " + dir, e);
    return;
  }
  for(let file of files) {
    let sub = dir + "/" + file;
    if(sub[0] === "/") {
      sub = sub.substring(1);
    }
    if(isLoraDir && file.endsWith(".safetensors")) {
      result.push(sub);
    }
    try {
      let stat = await fs.promises.stat(base + "/" + sub);
      if(stat.isDirectory()) {
        await traverseLoras(result, base, sub);
      }
    } catch(e) {
      console.log("Failed to stat: " + sub);
    }
  }
};

app.get('/api/loras', async (req, res) => {
  // Return all diffusers models in models output
  // It'll return only subpath from models_path, 
  let result = [];
  await traverseLoras(result, modelsPath, "");
  res.send(result.map((path) => {
    return path.replace(modelsPath + "/", "");
  }));
});

app.delete('/api/outputs/:filename', (req, res) => {
  // Delete specific image and json file in outputs_path
  let filename = req.params.filename;
  // Check filename
  const imageNameRegExp = new RegExp("^[a-zA-Z0-9_\\-\\.]+$");
  if(typeof filename !== "string" || !imageNameRegExp.test(filename)) {
    res.status(400).send("Invalid filename");
    return;
  }
  // Delete file
  let name = filename + ".a";
  console.log("[INFO] Deleting file: " + outputsPath + "/" + name);

  fs.unlink(outputsPath + "/" + name, (err) => {
    if(err) {
      res.status(500).send("Cannot delete file");
      return;
    }
    res.send("OK");
  });
});

app.put('/api/values', (req, res) => {
  // Merge current values with the given values json in body
  // Parse body as JSON
  let body = "";
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    console.log("[INFO] Received values: " + body);
    var isJson = false;
    var json;
    try {
      json = JSON.parse(body);
      isJson = true;
    } catch(e) {
      console.log("Failed to parse JSON: " + body);
    }
    if(isJson) {
      // Read current values
      let values = "{}";
      try {
        await fs.promises.readFile(statePath + "/values.json", 'utf8');
      } catch(e) {
        console.log("Failed to read values.json. Use empty one");
      }
      // Try to parse
      try {
        let parsed = JSON.parse(values);
        mergeObject(parsed, json);
        values = JSON.stringify(parsed);
      } catch(e) {
        // If cannot parse, just write
        values = JSON.stringify(json);
      }
      // Write to file
      await fs.promises.writeFile(statePath + "/values.json", values);
      res.send("OK");
    } else {
      // Otherwise, just append to values after strip
      body = body.trim();
      await fs.promises.appendFile(statePath + "/values.as", body + "\n");
      res.send("OK");
    }
  });
});

// Archive APIs

app.post('/api/outputs/archive', (req, res) => {
  console.log("[INFO] Archive and clean...");
  // Run tar gz
  let filename = "out-" + currentDateInFormat() + ".tar.gz";
  let ps = child_process.spawn("tar",
    [ "-czf",
      archivesPath + "/" + filename,
      "-C", outputsPath,
      "."]);
  ps.on('close', (code) => {
    if(code != 0) {
      res.status(500).send("Cannot create archive");
      return;
    }
    fs.readdir(outputsPath, (err, files) => {
      for(let file of files) {
        let p = path.join(outputsPath, file);
        console.log("[INFO] Deleting file: " + p)
        fs.unlink(p, (err) => {});
      }
      let p = path.join(statePath, "last_job.json");
      console.log("[INFO] Deleting file: " + p)
      fs.unlink(p, (err) => {});
      res.send("OK");
    });
  });
});

// Daemon APIs
let daemonPS = undefined;
let daemonOutputs = "";

const killDaemon = () => {
  if(daemonPS !== undefined) {
    console.log("[INFO] Killing daemon... (pid = " + daemonPS.pid + ")");
    daemonPS.stdin.pause();
    daemonPS.kill('SIGTERM');
    daemonPS = undefined;
    return true;
  }
  return false;
};

const startDaemon = () => {
  daemonOutputs = "";
  console.log("[INFO] Starting daemon...");
  daemonPS = child_process.spawn("bash", ["daemon/run.sh"]);
  daemonPS.stdout.on('data', (data) => {
    daemonOutputs += data.toString() + "\n";
    if(daemonOutputs.length > 65536) {
      daemonOutputs = daemonOutputs.slice(-65535);
    }
  });
  daemonPS.stderr.on('data', (data) => {
    daemonOutputs += data.toString() + "\n";
    if(daemonOutputs.length > 65536) {
      daemonOutputs = daemonOutputs.slice(-65535);
    }
  });
  daemonPS.on('exit', (code) => {
    console.log("[INFO] Daemon exited with code " + code);
    daemonPS = undefined;
  });
};

app.get('/api/daemon', (req, res) => {
  if(daemonPS === undefined) {
    res.send("not_running");
    return;
  }
  res.send("running");
});

app.put('/api/daemon', (req, res) => {
  // Switch
  let running = daemonPS !== undefined;
  killDaemon();
  if(!running) {
    startDaemon();
  }
  res.send("OK");
});

app.post('/api/daemon/start', (req, res) => {
  killDaemon();
  startDaemon();
  res.send("OK");
});

app.post('/api/daemon/stop', (req, res) => {
  killDaemon();
  res.send("OK");
});

app.get('/api/daemon/outputs', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(daemonOutputs);
});


// Download Model

app.get('/api/download-model-presets', (req, res) => {
  res.send(webuiModelDownloadPresets);
});

let downloadPS = [];

const addDownloadPS = (ps, repoID, subdir) => {
  let obj = {
    repoID: repoID,
    subdir: subdir,
    ps: ps,
    started: new Date(),
  };
  downloadPS.push(obj);
  ps.stdout.on('data', (data) => {
    obj.out += data.toString();
  });
  ps.stderr.on('data', (data) => {
    obj.out += data.toString();
  });
  ps.on('exit', (code) => {
    // Remove from download ps
    console.log("[INFO] Downloading model: Done (" + repoID + ", " + subdir + ")");
    downloadPS = downloadPS.filter((x) => x.repoID != repoID || x.subdir != subdir);
  });
};

// New model download
app.post('/api/download-model', (req, res) => {
  // Parse body as JSON
  let body = "";
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    console.log("[INFO] Received model: " + body);
    var json;
    try {
      json = JSON.parse(body);
    } catch(e) {
      res.status(400).send("Invalid JSON");
      return;
    }
    const repoID = json.repo_id;
    const subdir = json.subdir;
    // Create process
    let outPath = modelsPath + "/" + repoID;
    let ps = child_process.spawn(
      "bash", ["daemon/download-hf-snapshot.sh", outPath, repoID, subdir]);
    addDownloadPS(ps, repoID, subdir);
    res.send("OK");
  });
});

// New model download
app.post('/api/download-lora', (req, res) => {
  // Parse body as JSON
  let body = "";
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', async () => {
    console.log("[INFO] Received model: " + body);
    var json;
    try {
      json = JSON.parse(body);
    } catch(e) {
      res.status(400).send("Invalid JSON");
      return;
    }
    const url = json.url;
    const name = json.name;
    // Create process
    // mkdir to model_path/lora
    let outPath = modelsPath + "/lora";
    if(!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, {recursive: true});
    }
    let filename = name + ".safetensors";
    let ps = child_process.spawn(
      "curl", ["-L", "-o", outPath + "/" + filename, url]);
    let repoID = url;
    let subdir = "lora/" + filename;
    addDownloadPS(ps, repoID, subdir);
    res.send("OK");
  });
});

// Get download status
app.get('/api/download-model', (req, res) => {
  let lst = [];
  for(let obj of downloadPS) {
    lst.push({
      repo_id: obj["repo_id"],
      subdir: obj["subdir"],
      out: obj["out"].slice(-200),
    });
  }
  res.send(JSON.stringify(lst));
});


// Open server with random port
let server = app.listen(webuiPort, webuiHost, () => {
  console.log("[INFO] - Open http://" + server.address().address + ":" + server.address().port + "/ in your browser")
});
