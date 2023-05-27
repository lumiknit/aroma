// Helpers

const last2 = (str) => {
  // Extract last 2 characters from string
  return str.substring(str.length - 2);
};

const randomID = () => {
  // Generate random ID using time and random number
  let time = new Date().getTime();
  let rand = Math.floor(Math.random() * 100000);
  return time + "-" + rand;
};

const formatDate = (date) => {
  let d = new Date(date);
  let y = "00" + d.getFullYear();
  let m = "00" + (d.getMonth() + 1);
  let day = "00" + d.getDate();
  let h = "00" + d.getHours();
  let min = "00" + d.getMinutes();
  let s = "00" + d.getSeconds();
  let dt = `${last2(y)}${last2(m)}${last2(day)}`;
  let tm = `${last2(h)}:${last2(min)}:${last2(s)}`;
  return `${dt} ${tm}`;
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


// UI
const appendAlert = (type, message) => {
  let alertID = randomID();
  let html = `
    <div id="a-alert-${alertID}" class="shadow alert alert-${type} alert-dismissible mt-2 fade show" role="alert">${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  $('#alert-placeholder').append(html);
  let delay = type === "success" ? 2000 : 5000;
  setTimeout(() => {
    $('#a-alert-' + alertID).alert('close');
  }, delay);
};
