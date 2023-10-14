const cheerio = require("cheerio");
const path = require("path");
const imageSize = require("image-size");
const url = require("url");
const fs = require("fs");

hexo.extend.filter.register("after_render:html", function (str, data) {
  const $ = cheerio.load(str);

  $("img").each(function () {
    const img = $(this);
    const src = img.attr("src");

    if (
      src &&
      (src.endsWith(".png") ||
        src.endsWith(".jpeg") ||
        src.endsWith(".jpg") ||
        src.endsWith(".gif") || 
        src.endsWith(".webp"))
    ) {
      const parsedUrl = url.parse(src);
      const imgPathPart = parsedUrl.path;
      const imgPath = path.join(__dirname, "../images", imgPathPart);

      // 检查文件是否存在
      if (fs.existsSync(imgPath)) {
        const dimensions = imageSize(imgPath);
        const width = dimensions.width;

        const small = src + "/webp400";
        const middle = src + "/webp800";
        const large = src + "/webp1600";
        const origin = src + "/webp";
        let srcset = `${origin} ${width}w`;
        if (width > 400) srcset += `, ${small} 400w`;
        if (width > 800) srcset += `, ${middle} 800w`;
        if (width > 1600) srcset += `, ${large} 1600w`;
        img.attr("srcset", srcset);
        let sizes;
        if (width <= 400) {
          sizes = `${width}px`;
        } else {
          sizes="(min-width: 1150px) 723px, (min-width: 48em) calc((100vw - 120px) * 3 / 4 - 50px), (min-width: 35.5em) calc((100vw - 75px), calc(100vw - 40px)"
        }
        img.attr("sizes", sizes);
        img.attr("src", origin);
      }
    }
  });

  return $.html();
});
