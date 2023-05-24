const child_process = require('child_process');
const fs = require('fs');
const express = require('express');
const path = require('path');
const process = require('process');

// Helpers

const mergeObject = (dst, src) => {
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

// Find script path
const cdToRepoRoot = () => {
  // Move to aroma repo root
  let base = __dirname;
  process.chdir(base + "/..");
};
cdToRepoRoot();

console.log("[NOTE] Current directory: " + process.cwd());

// Read config.json
console.log("[INFO] Reading config.json...");
const default_config_json = fs.readFileSync('default_config.json', 'utf8');
const default_config = JSON.parse(default_config_json);

const config_json = fs.readFileSync('config.json', 'utf8');
const config = mergeObject(default_config, JSON.parse(config_json));

const models_path = config.models_root;
const outputs_path = config.outputs_root;
const state_path = config.state_root;
const archives_path = config.archives_root;

console.log("[NOTE] Paths:");
console.log("       - models_path: " + models_path);
console.log("       - outputs_path: " + outputs_path);
console.log("       - state_path: " + state_path);
console.log("       - archives_path: " + archives_path);

const webui_host = config.webui.host;
const webui_port = config.webui.port;

// Create each directory if not exists
const createDirIfNotExists = (dir) => {
  if(!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
};
createDirIfNotExists(models_path);
createDirIfNotExists(outputs_path);
createDirIfNotExists(state_path);
createDirIfNotExists(archives_path);


// --- Create express.js app
const app = express();

// - Static files
app.use('/aroma-static/archives/', express.static(archives_path));
app.use('/aroma-static/outputs', express.static(outputs_path));
app.use('/aroma-static/state', express.static(state_path, {
  maxAge: 200,
}));
app.use('/static', express.static(__dirname + "/public"));

// - APIs

app.get('/', (req, res) => {
  res.redirect('/static/index.html');
});
app.get('/home', (req, res) => {
  res.redirect('/static/index.html');
});
app.get('/index.html', (req, res) => {
  res.redirect('/static/index.html');
});

app.get('/api/archives', (req, res) => {
  res.set('Cache-Control', 'no-store');
  fs.readdir(archives_path, (err, files) => {
    res.send(files);
  });
});


app.get('/api/outputs', (req, res) => {
  res.set('Cache-Control', 'no-store');
  fs.readdir(outputs_path, (err, files) => {
    let a = [];
    for(let file of files) {
      let ext = path.extname(file);
      if(ext === ".a") {
        a.push(file.substr(0, file.lastIndexOf(".")));
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
  await traverseModels(result, models_path);
  res.send(result.map((path) => {
    return path.replace(models_path + "/", "");
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
  console.log("[INFO] Deleting file: " + outputs_path + "/" + name);

  fs.unlink(outputs_path + "/" + name, (err) => {
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
    var json;
    try {
      json = JSON.parse(body);
    } catch(e) {
      res.status(400).send("Invalid JSON");
      return;
    }
    // Read current values
    let values = "{}";
    try {
      await fs.promises.readFile(state_path + "/values.json", 'utf8');
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
    await fs.promises.writeFile(state_path + "/values.json", values);
    res.send("OK");
  });
});

// Archive APIs
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

app.post('/api/outputs/archive', (req, res) => {
  console.log("[INFO] Archive and clean...");
  // Run tar gz
  let filename = "out-" + currentDateInFormat() + ".tar.gz";
  let ps = child_process.spawn("tar",
    [ "-czf",
      archives_path + "/" + filename,
      "-C", outputs_path,
      "."]);
  ps.on('close', (code) => {
    if(code != 0) {
      res.status(500).send("Cannot create archive");
      return;
    }
    fs.readdir(outputs_path, (err, files) => {
      for(let file of files) {
        let p = path.join(outputs_path, file);
        console.log("[INFO] Deleting file: " + p)
        fs.unlink(p, (err) => {});
      }
      let p = path.join(state_path, "last_job.json");
      console.log("[INFO] Deleting file: " + p)
      fs.unlink(p, (err) => {});
      res.send("OK");
    });
  });
});

// Daemon APIs
let daemon_ps = undefined;
let daemon_outputs = "";

const killDaemon = () => {
  if(daemon_ps !== undefined) {
    console.log("[INFO] Killing daemon... (pid = " + daemon_ps.pid + ")");
    daemon_ps.stdin.pause();
    daemon_ps.kill('SIGTERM');
    daemon_ps = undefined;
    return true;
  }
  return false;
};

const startDaemon = () => {
  daemon_outputs = "";
  console.log("[INFO] Starting daemon...");
  daemon_ps = child_process.spawn("bash", ["daemon/run.sh"]);
  daemon_ps.stdout.on('data', (data) => {
    daemon_outputs += data.toString() + "\n";
    if(daemon_outputs.length > 65536) {
      daemon_outputs = daemon_outputs.slice(-65535);
    }
  });
  daemon_ps.stderr.on('data', (data) => {
    daemon_outputs += data.toString() + "\n";
    if(daemon_outputs.length > 65536) {
      daemon_outputs = daemon_outputs.slice(-65535);
    }
  });
  daemon_ps.on('exit', (code) => {
    console.log("[INFO] Daemon exited with code " + code);
    daemon_ps = undefined;
  });
};

app.get('/api/daemon', (req, res) => {
  if(daemon_ps === undefined) {
    res.send("not_running");
    return;
  }
  res.send("running");
});

app.put('/api/daemon', (req, res) => {
  // Switch
  let running = daemon_ps !== undefined;
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
  res.send(daemon_outputs);
});


// Download Model
let download_ps = [];

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
    const repo_id = json.repo_id;
    const subdir = json.subdir;
    // Create process
    let out_path = models_path + "/" + repo_id;
    let ps = child_process.spawn(
      "bash", ["daemon/download-hf-snapshot.sh", out_path, repo_id, subdir]);
    let obj = {
      repo_id: repo_id,
      subdir: subdir,
      ps: ps,
      out: "",
    };
    // Add to download ps
    download_ps.push(obj);
    ps.stdout.on('data', (data) => {
      obj.out += data.toString();
    });
    ps.stderr.on('data', (data) => {
      obj.out += data.toString();
    });
    ps.on('exit', (code) => {
      // Remove from download ps
      console.log("[INFO] Downloading model: Done (" + repo_id + ", " + subdir + ")");
      download_ps = download_ps.filter((x) => x["repo_id"] != repo_id || x["subdir"] != subdir);
    });
    res.send("OK");
  });
});

// Get download status
app.get('/api/download-model', (req, res) => {
  let lst = [];
  for(let obj of download_ps) {
    lst.push({
      repo_id: obj["repo_id"],
      subdir: obj["subdir"],
      out: obj["out"].slice(-200),
    });
  }
  res.send(JSON.stringify(lst));
});


// Open server with random port
let server = app.listen(webui_port, webui_host, () => {
  console.log("[INFO] - Open http://" + server.address().address + ":" + server.address().port + "/ in your browser")
});
