
const loadArchives = () => {
  // Call api GET /api/archives
  $.ajax({
    url: '/api/archives',
    method: 'GET',
    dataType: 'json',
    success: (data) => {
      // Add list to
      const list = $('#archives-list');
      list.empty();
      for(let archive of data) {
        const item = $('<li class="list-group-item"></li>');
        const link = $('<a href="/aroma-static/archives/' + archive + '">' + archive + '</a>');
        item.append(link);
        list.append(item);
        console.log(archive);
      }
    },
    error: (xhr, status, error) => {
      $('#archives-list').text("Failed to load archives");
      console.log("[ERROR] Cannot load archives: " + error);
    }
  });
};

// Init
$(() => {
  loadArchives();
});
