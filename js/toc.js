$(function() {
    var fix = $('#toc');                        //滚动悬浮块
    var fixTop = fix.offset().top,              //滚动悬浮块与顶部的距离
        fixHeight = fix.height();               //滚动悬浮块高度

    $(window).scroll(function() {
        $(":header").each(function() {
            var id = $(this).attr('id');
            // 跳过标题
            if (typeof id != 'undefined'){
                var margin_height = parseInt($(this).css('marginTop'));
                if($(window).scrollTop() >= $(this).offset().top-margin_height) {
                    $('a.toc-link').removeClass('active');
                    var escapeHerf = encodeURIComponent(id)
                    $('a.toc-link[href="#' + escapeHerf + '"]').addClass('active');
                }
            }
        });
        
        //页面与顶部高度
        var docTop = Math.max(document.body.scrollTop, document.documentElement.scrollTop);
        if (fixTop < docTop) {
            fix.css({'position': 'fixed'});
            fix.css({top: 0});              //滚动悬浮块未到结束块上时，top为0
        } else {
            fix.css({'position': 'static'});
        }
    })
});
