hexo.extend.filter.register('post_permalink', function (data) {
  if (data.endsWith('.en/')) {
    let parts = data.split('/');
    let [year, month, day, title] = parts;
    title = title.replace(/\.en$/, '');
    return `en/${year}/${month}/${day}/${title}/`;
  }
  return data;
});

hexo.extend.generator.register('post', function (locals) {
  return locals.posts.map(function (post) {
    let path = post.path;
    if (post.lang === 'en') {
      path = path.replace(/\.en\.html$/, '.html');
    }
    return {
      path: path,
      data: post,
      layout: 'post'
    };
  });
});

hexo.extend.filter.register('before_post_render', function (data) {
  if (data.source.endsWith('.en.md')) {
    data.lang = 'en';
  }
  return data;
});