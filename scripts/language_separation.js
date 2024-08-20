function createPageGenerator(type, lang) {
  return function (locals) {
    const allPosts = locals["posts"];
    const enPosts = allPosts.filter((post) => post.lang === "en");
    const zhPosts = allPosts.filter((post) => post.lang === "zh-CN" || !post.lang);

    const posts = lang === "en" ? enPosts : zhPosts;
    // console.log("Cal", allPosts.length, enPosts.length, zhPosts.length, posts.length);
    let path = lang === "en" ? "en/" : "";

    // 首页特殊处理
    if (type === "") {
      const perPage =
        this.config.index_generator.per_page || this.config.per_page;
      const paginationDir = this.config.pagination_dir || "page";

      if (!perPage) {
        // 如果 per_page 为 0 或未定义，禁用分页
        return {
          path: path + "index.html",
          data: {
            posts: posts.sort("-date"),
            lang: lang,
            index: true,
          },
          layout: ["index", "archive"],
        };
      }

      // 使用 Hexo 内置的分页逻辑
      const data = posts.sort("-date");
      const totalPages = Math.ceil(data.length / perPage);
      const results = [];

      for (let i = 1; i <= totalPages; i++) {
        const currentPage = {
          path:
            i === 1
              ? path + "index.html"
              : path + paginationDir + "/" + i + "/",
          data: {
            posts: data.slice((i - 1) * perPage, i * perPage),
            lang: lang,
            index: true,
            current: i,
            total: totalPages,
            prev: i > 1 ? i - 1 : 0,
            next: i < totalPages ? i + 1 : 0,
          },
          layout: ["index", "archive"],
        };
        results.push(currentPage);
      }

      return results;
    }

    // 归档保持原有逻辑
    path += type + "/index.html";
    return {
      path: path,
      data: {
        posts: posts.sort("-date"),
        lang: lang,
        [type]: true,
      },
      layout: [type, "archive", "index"],
    };
  };
}

// 注册生成器
hexo.extend.generator.register("index", createPageGenerator("", "zh-CN"));
hexo.extend.generator.register("en_index", createPageGenerator("", "en"));
hexo.extend.generator.register("archives", createPageGenerator("archives", "zh-CN"));
hexo.extend.generator.register("en_archives", createPageGenerator("archives", "en"));

// 标签和分类生成器
const typeMap = {
  tags: "tag",
  categories: "category",
};

// 辅助函数：创建语言特定的集合
function createLanguageSpecificCollection(items, lang) {
  return items.filter((item) =>
    item.posts.data.some(
      (post) => post.lang === lang || (lang === "zh-CN" && !post.lang)
    )
  );
}

function createTaxonomyGenerator(type, lang) {
  // console.log("Register", type, lang);
  return function (locals) {
    const singularType = typeMap[type];
    const allTypes = hexo.locals.get(type);
    const langType = lang === "en" ? "en" : "zh-CN";
    const taxonomies = createLanguageSpecificCollection(allTypes.toArray(), langType);
    // console.log("Generate", type, lang, taxonomies.length);
    return taxonomies.map((taxonomy) => {
      const data = {
        posts: taxonomy.posts
          .filter(
            (post) => post.lang === lang || (lang === "zh-CN" && !post.lang)
          )
          .sort("-date"),
        lang: lang,
        [singularType]: taxonomy.name, // 使用单数形式作为键
        [type]: true, // 保留复数形式的布尔标志
      };

      return {
        path:
          lang === "en"
            ? `en/${type}/${taxonomy.slug}/index.html`
            : `${type}/${taxonomy.slug}/index.html`,
        data: data,
        layout: [singularType, "archive", "index"],
      };
    });
  };
}

hexo.extend.generator.register("tag", createTaxonomyGenerator("tags", "zh-CN"));
hexo.extend.generator.register("en_tag", createTaxonomyGenerator("tags", "en"));
hexo.extend.generator.register(
  "category",
  createTaxonomyGenerator("categories", "zh-CN")
);
hexo.extend.generator.register(
  "en_category",
  createTaxonomyGenerator("categories", "en")
);

hexo.extend.filter.register("post_permalink", function (data) {
  if (data.endsWith(".en/")) {
    let parts = data.split("/");
    let [year, month, day, title] = parts;
    title = title.replace(/\.en$/, "");
    return `en/${year}/${month}/${day}/${title}/`;
  }
  return data;
});

hexo.extend.generator.register("post", function (locals) {
  return locals.posts.map(function (post) {
    let path = post.path;
    if (post.lang === "en") {
      path = path.replace(/\.en\.html$/, ".html");
    }
    return {
      path: path,
      data: post,
      layout: "post",
    };
  });
});

hexo.extend.filter.register("before_post_render", function (data) {
  if (data.source.endsWith(".en.md")) {
    data.lang = "en";
  }
  return data;
});
