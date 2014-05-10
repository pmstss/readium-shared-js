//  Created by Boris Schneiderman.
//  Copyright (c) 2014 Readium Foundation and/or its licensees. All rights reserved.
//  
//  Redistribution and use in source and binary forms, with or without modification, 
//  are permitted provided that the following conditions are met:
//  1. Redistributions of source code must retain the above copyright notice, this 
//  list of conditions and the following disclaimer.
//  2. Redistributions in binary form must reproduce the above copyright notice, 
//  this list of conditions and the following disclaimer in the documentation and/or 
//  other materials provided with the distribution.
//  3. Neither the name of the organization nor the names of its contributors may be 
//  used to endorse or promote products derived from this software without specific 
//  prior written permission.
//  
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
//  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
//  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
//  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
//  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, 
//  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE 
//  OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
//  OF THE POSSIBILITY OF SUCH DAMAGE.


/*
 * Renders one page of fixed layout spread
 * @class ReadiumSDK.Views.OnePageView
 */

//Representation of one fixed page
ReadiumSDK.Views.OnePageView = function(options, classes, enableBookStyleOverrides){

    _.extend(this, Backbone.Events);

    var self = this;

    var _$epubHtml;
    var _$el;
    var _$iframe;
    var _currentSpineItem;
    var _spine = options.spine;
    var _iframeLoader = options.iframeLoader;
    var _navigationLogic = undefined;
    var _bookStyles = options.bookStyles;

    var _isIframeLoaded = false;

    var _enablePageTransitions = options.enablePageTransitions;

    // fixed layout does not apply user styles to publisher content, but reflowable scroll view does
    var _enableBookStyleOverrides = enableBookStyleOverrides || false;

    var _meta_size = {
        width: 0,
        height: 0
    };
    
    var _pageSwitchDir = 0; // 0 => stay on same page, 1 => previous, 2 => next
    var _pageSwitchActuallyChanged = false;
    var _pageSwitchActuallyChanged_IFRAME_LOAD = false;
    this.pageSwitchDir = function(dir, hasChanged)
    {
        if (_pageSwitchActuallyChanged_IFRAME_LOAD)
        {
//console.error("pageSwitchDir _pageSwitchActuallyChanged_IFRAME_LOAD SKIP");
            return;
        }
        
        _pageSwitchDir = dir;
        _pageSwitchActuallyChanged = hasChanged;
    };
    

    this.element = function() {
        return _$el;
    };

    this.meta_height = function() {
        return _meta_size.height;
    };

    this.meta_width = function() {
        return _meta_size.width;
    };

    this.isDisplaying = function() {

        return _isIframeLoaded;
    };

    this.render = function() {

        if(!_$iframe) {

            var template = ReadiumSDK.Helpers.loadTemplate("single_page_frame", {});

            _$el = $(template);

            _.each(['-webkit-', '-moz-', '-ms-', ''], function(prefix) {
                _$el.css(prefix + "transition", "all 0 ease 0");
            });

            _$el.css("height", "100%");
            _$el.css("width", "100%");

            for(var i = 0, count = classes.length; i < count; i++) {
                _$el.addClass(classes[i]);
            }

            _$iframe = $("iframe", _$el);

            _$iframe.css("width", "100%");
            //_$iframe.css("height", "100%");
            _$iframe.css("height", window.innerHeight || window.clientHeight);
        }

        _navigationLogic = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return this;
    };


    this.decorateIframe = function()
    {
        if (!_$iframe || !_$iframe.length) return;
        
        _$iframe.css("border-bottom", "1px dashed silver");
        _$iframe.css("border-top", "1px dashed silver");
    }
    
    this.remove = function() {
        _isIframeLoaded = false;
        _currentSpineItem = undefined;
        _$el.remove();
    };

    this.clear = function() {
        _isIframeLoaded = false;
        _$iframe[0].src = "";
    };

    this.currentSpineItem = function() {

        return _currentSpineItem;
    };

    function onIFrameLoad(success) {

        if(success) {
            _isIframeLoaded = true;
            var epubContentDocument = _$iframe[0].contentDocument;
            _$epubHtml = $("html", epubContentDocument);
            if (!_$epubHtml || _$epubHtml.length == 0) {
                _$epubHtml = $("svg", epubContentDocument);
            }
            
            //_$epubHtml.css("overflow", "hidden");

            if (_enableBookStyleOverrides) {
                self.applyBookStyles();
            }
            
            updateMetaSize();

            self.trigger(ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPENED, _$iframe, _currentSpineItem, self);
        }
    }

    this.applyBookStyles = function() {

        if(_$epubHtml) {
            ReadiumSDK.Helpers.setStyles(_bookStyles.getStyles(), _$epubHtml);
        }
    };

    this.transformContent = function(scale, left, top) {

        var elWidth = Math.ceil(_meta_size.width * scale);
        var elHeight = Math.floor(_meta_size.height * scale);
                                                    
        _$el.css("left", left + "px");
        _$el.css("top", top + "px");
        _$el.css("width", elWidth + "px");
        _$el.css("height", elHeight + "px");
                                                    
        _$iframe.css("width", elWidth + "px");
        _$iframe.css("height", elHeight + "px");

        var css = generateTransformCSS(scale, 0, 0);

        css["width"] = _meta_size.width;
        css["height"] = _meta_size.height;

        if(!_$epubHtml) {
            debugger;
        }

        _$epubHtml.css(css);
        
        // Chrome workaround: otherwise text is sometimes invisible (probably a rendering glitch due to the 3D transform graphics backend?)
        //_$epubHtml.css("visibility", "hidden"); // "flashing" in two-page spread mode is annoying :(
        _$epubHtml.css("opacity", "0.9");
        
        _$iframe.css("visibility", "visible");
        
        setTimeout(function()
        {
            //_$epubHtml.css("visibility", "visible");
            _$epubHtml.css("opacity", "1");
        }, 0);
    };

    function generateTransformCSS(scale, left, top) {

        var transformString = "translate(" + left + "px, " + top + "px) scale(" + scale + ")";

        //TODO modernizer library can be used to get browser independent transform attributes names (implemented in readium-web fixed_layout_book_zoomer.js)
        var css = {};
        css["-webkit-transform"] = transformString;
        css["-webkit-transform-origin"] = "0 0";

        return css;
    }

    function updateMetaSize() {

        _meta_size.width = 0;
        _meta_size.height = 0;

        var contentDocument = _$iframe[0].contentDocument;

        // first try to read viewport size
        var content = $('meta[name=viewport]', contentDocument).attr("content");

        // if not found try viewbox (used for SVG)
        if(!content) {
            content = $('meta[name=viewbox]', contentDocument).attr("content");
        }

        if(content) {
            var size = parseSize(content);
            if(size) {
                _meta_size.width = size.width;
                _meta_size.height = size.height;
            }
        }
        else { //try to get direct svg or image size
            
            // try SVG element's width/height first
            var $svg = $(contentDocument).find('svg');
            if ($svg.length > 0) {
                _meta_size.width = parseInt($svg.attr("width"), 10);
                _meta_size.height = parseInt($svg.attr("height"), 10);
            }
            else {
                var $img = $(contentDocument).find('img');
                if($img.length > 0) {
                    _meta_size.width = $img.width();
                    _meta_size.height = $img.height();
                }
            }
        }

        if(!_meta_size.width || !_meta_size.height) {
            console.error("Invalid document: viewport is not specified!");
        }

    }

    this.loadSpineItem = function(spineItem) {

        if(_currentSpineItem != spineItem) {

            _currentSpineItem = spineItem;
            var src = _spine.package.resolveRelativeUrl(spineItem.href);

            //hide iframe until content is scaled
            _$iframe.css("visibility", "hidden");
            self.trigger(ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPEN_START, _$iframe, _currentSpineItem);
            _iframeLoader.loadIframe(_$iframe[0], src, onIFrameLoad, self, {spineItem : spineItem});
        }
        else
        {
            this.trigger(ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPENED, _$iframe, _currentSpineItem, false);
        }
    };

    function parseSize(content) {

        var pairs = content.replace(/\s/g, '').split(",");

        var dict = {};

        for(var i = 0;  i  < pairs.length; i++) {
            var nameVal = pairs[i].split("=");
            if(nameVal.length == 2) {

                dict[nameVal[0]] = nameVal[1];
            }
        }

        var width = Number.NaN;
        var height = Number.NaN;

        if(dict["width"]) {
            width = parseInt(dict["width"]);
        }

        if(dict["height"]) {
            height = parseInt(dict["height"]);
        }

        if(!isNaN(width) && !isNaN(height)) {
            return { width: width, height: height} ;
        }

        return undefined;
    }

    this.getFirstVisibleElementCfi = function(){

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return navigation.getFirstVisibleElementCfi(0);

    };

    this.getElementByCfi = function(spineItem, cfi, classBlacklist, elementBlacklist, idBlacklist) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return navigation.getElementByCfi(cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    this.getElement = function(spineItem, selector) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return navigation.getElement(selector);
    };

    this.getFirstVisibleMediaOverlayElement = function() {
        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return navigation.getFirstVisibleMediaOverlayElement({top:0, bottom: _$iframe.height()});
    }

};

ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPEN_START = "SpineItemOpenStart";
ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPENED = "SpineItemOpened";
