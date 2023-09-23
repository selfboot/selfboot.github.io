const cheerio = require('cheerio');

hexo.extend.filter.register('after_render:html', function(str, data) {
  const $ = cheerio.load(str);
  $('img').each(function() {
    const src = $(this).attr('src');
    if (src && (src.endsWith('.png') || src.endsWith('.jpeg') || src.endsWith('.jpg'))) {
      $(this).attr('src', src + '/webp');
    }
  });
  return $.html();
});
