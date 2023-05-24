window.onload = (function() {
  var e = document.getElementById('github-usercard');
  var username = e.getAttribute("user");

  if (username) {
    var api_url = 'https://api.github.com/users/' + username;
  } else {
    return fail();
  }

  var request = new XMLHttpRequest();
  request.onreadystatechange = function() { // 状态发生变化时，函数被回调
    if (request.readyState === 4) { // 成功完成
      // 判断响应结果:
      if (request.status === 200) {
        // 成功，通过responseText拿到响应的文本:
        return success(request.responseText);
      } else {
        return fail();
      }
    } else {
      // HTTP请求还在继续...
    }
  }

  // 发送请求:
  request.open('GET', api_url);
  request.send();

  function success(text) {
    var response_obj = JSON.parse(request.responseText)
    var s =
      '<div class="github-usercard">' +
      '<div class="github-hd">' +
      '<a class="github-avatar" href="' + response_obj.html_url + '" target="_top">' +
      '<img src="' + response_obj.avatar_url + '&amp;s=48"></a>' +
      '</a>' +
      '<strong><a target="_blank" href="' + response_obj.html_url + '">' +
      response_obj.name + '</a></strong>' +
      '<span>@' + username + '</span>' +
      '</div>' +
      '<div class="github-bd">' +
      '<div class="github-desc">' +
      response_obj.bio +
      '<ul><li>' +
      '<a href="https://github.com/' + username + '?tab=repositories" target="_top"><strong>' + response_obj.public_repos + '</strong>Repos</a>' +
      '</li>' +
      '<li>' +
      '<a href="https://gist.github.com/' + username + '" target="_top"><strong>' + response_obj.public_gists + '</strong>Gists</a>' +
      '</li>' +
      '<li>' +
      '<a href="https://github.com/xuelangZF/followers" target="_top"><strong>' + response_obj.followers + '</strong>Followers</a></li>' +
      '</ul>' +
      '</div>' +
      '</div>' +
      '<div class="github-ft">' +
      '<a class="github-via" href="' + (response_obj.blog || response_obj.html_url) + '">Work for Tencent.</a>' +
      '<a class="github-btn" href="' + response_obj.html_url + '">Follow</a>' +
      '</div>' +
      '</div>';
    e.innerHTML = s;
  }

  function fail() {
    var s = '<div class="github-usercard">' +
      '<div class="github-hd">' +
      '<a class="github-avatar" href="https://github.com/selfboot" target="_top">' +
      '<img src="https://avatars2.githubusercontent.com/u/2769831"></a>' +
      '</a>' +
      '<strong><a target="_blank" href="https://github.com/selfboot">' +
      'selfboot' + '</a></strong>' +
      '<span>@selfboot</span>' +
      '</div>' +
      '<div class="github-bd">' +
      '<div class="github-desc">' +
      'A student of Computer Science, like coding, reading!' +
      '<ul><li>' +
      '<a href="https://github.com/selfboot?tab=repositories" target="_top"><strong>' + "***" + '</strong>Repos</a>' +
      '</li>' +
      '<li>' +
      '<a href="https://gist.github.com/selfboot" target="_top"><strong>' + "***" + '</strong>Gists</a>' +
      '</li>' +
      '<li>' +
      '<a href="https://github.com/selfboot?tab=followers" target="_top"><strong>' + "***" + '</strong>Followers</a></li>' +
      '</ul>' +
      '</div>' +
      '</div>' +
      '<div class="github-ft">' +
      '<a class="github-via" href="https://github.com/selfboot">Work for Tencent.</a>' +
      '<a class="github-btn" href="https://github.com/selfboot">Follow</a>' +
      '</div>' +
      '</div>';

    e.innerHTML = s;
  }
});

