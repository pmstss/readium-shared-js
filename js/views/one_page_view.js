//  Created by Boris Schneiderman.
//  Copyright (c) 2012-2013 The Readium Foundation.
//
//  The Readium SDK is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.


/*
 * Renders one page of fixed layout spread
 * @class ReadiumSDK.Views.OnePageView
 */

//Representation of one fixed page
ReadiumSDK.Views.OnePageView = function(options){

    _.extend(this, Backbone.Events);

    var self = this;

    var _$epubHtml;
    var _$el;
    var _$iframe;
    var _currentSpineItem;
    var _spine = options.spine;
    var _contentAlignment = options.contentAlignment;
    var _iframeLoader = options.iframeLoader;
    var _navigationLogic = undefined;
    var _bookStyles = options.bookStyles;

    var _meta_size = {
        width: 0,
        height: 0
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

        return _currentSpineItem != undefined && _$epubHtml != null && _$epubHtml.length > 0;
    };

    this.render = function() {

        var template = ReadiumSDK.Helpers.loadTemplate("fixed_page_frame", {});

        _$el = $(template);

        _$el.css("height", "100%");
        _$el.css("width", "100%");

        _$el.addClass(options.class);
        _$iframe = $("iframe", _$el);

        _navigationLogic = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return this;
    };


    this.remove = function() {
        _currentSpineItem = undefined;
        _$el.remove();
    };

    this.currentSpineItem = function() {

        return _currentSpineItem;
    };

    function onIFrameLoad(success) {

        if(success) {
            var epubContentDocument = _$iframe[0].contentDocument;
            _$epubHtml = $("html", epubContentDocument);
            if (!_$epubHtml || _$epubHtml.length == 0) {
                _$epubHtml = $("svg", epubContentDocument);
            }
            _$epubHtml.css("overflow", "hidden");
            //self.applyBookStyles();
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

        var elWidth = Math.floor(_meta_size.width * scale);
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
        css["-moz-transform"] = transformString;
        css["-moz-transform-origin"] = "0 0";
        css["-ms-transform"] = transformString;
        css["-ms-transform-origin"] = "0 0";
        css["transform"] = transformString;
        css["transform-origin"] = "0 0";
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
            self.trigger(ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPENED, _$iframe, _currentSpineItem, false);
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

        return _navigationLogic.getFirstVisibleElementCfi(0);
    };

    this.getElementByCfi = function(spineItem, cfi, classBlacklist, elementBlacklist, idBlacklist) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        return _navigationLogic.getElementByCfi(cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    this.getElement = function(spineItem, selector) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        return _navigationLogic.getElement(selector);
    };

    this.getFirstVisibleMediaOverlayElement = function() {
        var navigation = new ReadiumSDK.Views.CfiNavigationLogic(_$el, _$iframe);
        return navigation.getFirstVisibleMediaOverlayElement({top:0, bottom: _$iframe.height()});
    };
    
    this.getElements = function(spineItem, selector) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        return _navigationLogic.getElements(selector);
    };
    
        this.getVisibleElementsWithFilter = function(filterFunction, includeSpineItem) {

        var visibleContentOffsets = {top:0, bottom: _$iframe.height()};
        var elements = _navigationLogic.getVisibleElementsWithFilter(visibleContentOffsets,filterFunction);

        if (includeSpineItem) {
            return {elements: elements, spineItem:_currentSpineItem};
        } else {
            return elements;
        }

    };

    this.getAllElementsWithFilter = function(filterFunction, includeSpineItem) {
        var elements = _navigationLogic.getAllElementsWithFilter(filterFunction);

        if (includeSpineItem) {
            return {elements: elements, spineItem:_currentSpineItem};
        } else {
            return elements;
        }
    };
};

ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPEN_START = "SpineItemOpenStart";
ReadiumSDK.Views.OnePageView.SPINE_ITEM_OPENED = "SpineItemOpened";
