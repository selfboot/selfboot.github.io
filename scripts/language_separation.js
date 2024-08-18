// 辅助函数：创建语言特定的集合
function createLanguageSpecificCollection(items, lang) {
  return items.filter(item =>
    item.posts.data.some(post => post.lang === lang || (lang === 'zh-CN' && !post.lang))
  );
}

  
// function createLanguageSpecificCollection(items, lang) {
  // return items.filter(item =>
  //   item.posts.data.some(post => post.lang === lang || (lang === 'zh-CN' && !post.lang))
  // );
// }

// 优化 before_generate 过滤器
hexo.extend.filter.register('before_generate', function () {
  const allPosts = hexo.locals.get('posts');

  // 分离文章
  hexo.locals.set('en_posts', () =>
    allPosts.filter(post => post.lang === 'en')
  );
  hexo.locals.set('zh_posts', () =>
    allPosts.filter(post => post.lang === 'zh-CN' || !post.lang)
  );

  // 分离标签
  const allTags = hexo.locals.get('tags');
  const enTags = createLanguageSpecificCollection(allTags.toArray(), 'en');
  const zhTags = createLanguageSpecificCollection(allTags.toArray(), 'zh-CN');
  hexo.locals.set('en_tags', () => enTags);
  hexo.locals.set('zh_tags', () => zhTags);

  // 分离分类
  const allCategories = hexo.locals.get('categories');
  hexo.locals.set('en_categories', () =>
    createLanguageSpecificCollection(allCategories.toArray(), 'en')
  );
  hexo.locals.set('zh_categories', () =>
    createLanguageSpecificCollection(allCategories.toArray(), 'zh-CN')
  );
});

function createPageGenerator(type, lang) {
  return function(locals) {
    const posts = lang === 'en' ? locals.en_posts : locals.zh_posts;
    let path = lang === 'en' ? 'en/' : '';

    // 首页特殊处理
    if (type === '') {
      const perPage = this.config.index_generator.per_page || this.config.per_page;
      const paginationDir = this.config.pagination_dir || 'page';

      if (!perPage) {
        // 如果 per_page 为 0 或未定义，禁用分页
        return {
          path: path + 'index.html',
          data: {
            posts: posts.sort('-date'),
            lang: lang,
            index: true
          },
          layout: ['index', 'archive']
        };
      }

      // 使用 Hexo 内置的分页逻辑
      const data = posts.sort('-date');
      const totalPages = Math.ceil(data.length / perPage);
      const results = [];

      for (let i = 1; i <= totalPages; i++) {
        const currentPage = {
          path: i === 1 ? (path + 'index.html') : (path + paginationDir + '/' + i + '/'),
          data: {
            posts: data.slice((i - 1) * perPage, i * perPage),
            lang: lang,
            index: true,
            current: i,
            total: totalPages,
            prev: i > 1 ? i - 1 : 0,
            next: i < totalPages ? i + 1 : 0
          },
          layout: ['index', 'archive']
        };
        results.push(currentPage);
      }

      return results;
    }
    
    // 其他页面类型保持原有逻辑
    path += type + '/index.html';
    return {
      path: path,
      data: {
        posts: posts.sort('-date'),
        lang: lang,
        [type]: true
      },
      layout: [type, 'archive', 'index']
    };
  };
}

// 注册生成器
hexo.extend.generator.register('index', createPageGenerator('', 'zh-CN'));
hexo.extend.generator.register('en_index', createPageGenerator('', 'en'));
hexo.extend.generator.register('archives', createPageGenerator('archives', 'zh-CN'));
hexo.extend.generator.register('en_archives', createPageGenerator('archives', 'en'));

// 标签和分类生成器
function createTaxonomyGenerator(type, lang) {
  return function (locals) {
    const taxonomies = lang === 'en' ? locals[`en_${type}`] : locals[`zh_${type}`];
    return taxonomies.map(taxonomy => ({
      path: lang === 'en' ? `en/${type}/${taxonomy.slug}/index.html` : `${type}/${taxonomy.slug}/index.html`,
      data: {
        [type]: taxonomy,
        posts: taxonomy.posts.filter(post => post.lang === lang || (lang === 'zh-CN' && !post.lang)),
        lang: lang
      },
      layout: [type, 'archive', 'index']
    }));
  };
}

hexo.extend.generator.register('tag', createTaxonomyGenerator('tags', 'zh-CN'));
hexo.extend.generator.register('en_tag', createTaxonomyGenerator('tags', 'en'));
hexo.extend.generator.register('category', createTaxonomyGenerator('categories', 'zh-CN'));
hexo.extend.generator.register('en_category', createTaxonomyGenerator('categories', 'en'));

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