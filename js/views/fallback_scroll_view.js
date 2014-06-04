//  Created by Boris Schneiderman.
// Modified by Daniel Weck
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

/****** THIS NEEDS TO BE REFACTORED INTO SCROLL_VIEW ******
/* This is only here until the scrollbar height problem is fixed there
 * Based on Reflowable view.
 */

ReadiumSDK.Views.FallbackScrollView = function(options){

    _.extend(this, Backbone.Events);

    var SCROLL_MARGIN_TO_SHOW_LAST_VISBLE_LINE = 5;

    var self = this;

    var _$viewport = options.$viewport;
    var _spine = options.spine;
    var _userStyles = options.userStyles;
    var _bookStyles = options.bookStyles;
    var _iframeLoader = options.iframeLoader;

    var _currentSpineItem;
    var _deferredPageRequest;
    var _fontSize = 100;
    var _$contentFrame;
    var _navigationLogic;
    var _$el;
    var _$iframe;
    var _$epubHtml;
    var _pageRequest;


    this.render = function(){

        var template = ReadiumSDK.Helpers.loadTemplate("reflowable_book_frame", {});

        _$el = $(template);
        _$viewport.append(_$el);

        renderIframe();

        //We will call onViewportResize after user stopped resizing window
        var lazyResize = _.debounce(self.onViewportResize, 100);
        $(window).on("resize.ReadiumSDK.reflowableView", _.bind(lazyResize, self));

        var lazyScroll = _.debounce(onScroll, 100);

        _$contentFrame.scroll(function(){
            lazyScroll();
        });

        return self;
    };

    function onScroll() {

        var initiator = _pageRequest ? _pageRequest.initiator : self;
        var elementId = _pageRequest ? _pageRequest.elementId : undefined;

        _pageRequest = undefined;

        onPaginationChanged(initiator, _currentSpineItem, elementId);
    }

    function setFrameSizesToRectangle(rectangle) {
        _$contentFrame.css("left", rectangle.left);
        _$contentFrame.css("top", rectangle.top);
        _$contentFrame.css("right", rectangle.right);
        _$contentFrame.css("bottom", rectangle.bottom);

    }

    this.remove = function() {

        $(window).off("resize.ReadiumSDK.reflowableView");
        _$el.remove();
    };

    this.isReflowable = function() {
        return true;
    };

    this.onViewportResize = function() {
        resizeIFrameToContent();
        onPaginationChanged(self);
    };

    this.setViewSettings = function(settings) {

        _fontSize = settings.fontSize;

        updateHtmlFontSize();

        resizeIFrameToContent();
        onPaginationChanged(self);
    };

    function renderIframe() {
        if (_$contentFrame) {
            //destroy old contentFrame
            _$contentFrame.remove();
        }

        var template = ReadiumSDK.Helpers.loadTemplate("reflowable_book_page_frame", {});
        var $bookFrame = $(template);
        $bookFrame = $('#reflowable-book-frame', _$viewport).append($bookFrame);

        _$contentFrame = $("#reflowable-content-frame", $bookFrame);
        _$contentFrame.css("overflow", "");
        _$contentFrame.css("overflow-y", "auto");
        _$contentFrame.css("-webkit-overflow-scrolling", "touch");
        _$contentFrame.css("width", "100%");
        _$contentFrame.css("height", "100%");

        _$iframe = $("#epubContentIframe", $bookFrame);
        _$iframe.css("width", "100%");
        _$iframe.css("height", "100%");

        _$iframe.css("left", "");
        _$iframe.css("right", "");
        _$iframe.css(_spine.isLeftToRight() ? "left" : "right", "0px");
        _$iframe.css("width", "100%");

        _navigationLogic = new ReadiumSDK.Views.CfiNavigationLogic(_$contentFrame, _$iframe);
    }

    function loadSpineItemPageRequest(pageRequest) {
        var spineItem = pageRequest.spineItem;
        if(_currentSpineItem != spineItem) {

            //create & append iframe to container frame
            renderIframe();

            _currentSpineItem = spineItem;

            var src = _spine.package.resolveRelativeUrl(spineItem.href);
            self.trigger(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, _$iframe, _currentSpineItem);
            _$iframe.css('opacity',0);
            _iframeLoader.loadIframe(_$iframe[0], src, onIFrameLoad, self, {pageRequest:pageRequest, spineItem : spineItem});
        }
    }

    function updateHtmlFontSize() {

        if(_$epubHtml) {
            _$epubHtml.css("font-size", _fontSize + "%");
        }
    }

    function setIframeHeight(height) {

        _$iframe.css("height", height + "px");
    }

    function resizeIFrameToContent() {

        if(!_$iframe || !_$epubHtml) {
            return;
        }

        //reset the iframe height to zero
        // (needed for IE9 or else it uses the height of the previous page/spine change)
        setIframeHeight(0);
        var contHeight = contentHeight();
        setIframeHeight(contHeight);
        //calculate and set the height again after a timeout, only if height ends up being larger
        // (css rendering workaround)
        setTimeout(function () {
            var contHeight2 = contentHeight();
            if (contHeight2 > contHeight) {
                setIframeHeight(contHeight2);
            }
        }, 500);

    }

    function onIFrameLoad(success, attachedData) {

        //while we where loading frame new request came
        if(attachedData && _deferredPageRequest && _deferredPageRequest.spineItem != attachedData.pageRequest.spineItem) {
            loadSpineItemPageRequest(_deferredPageRequest);
            return;
        }

        if(!success) {
            _deferredPageRequest = undefined;
            return;
        }

        self.trigger(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, _$iframe, _currentSpineItem);

        var epubContentDocument = _$iframe[0].contentDocument;
        _$epubHtml = $("html", epubContentDocument);

        self.applyBookStyles();

        updateHtmlFontSize();

        self.applyStyles();

        setTimeout(function(){
            resizeIFrameToContent();
            openDeferredElement();
            onPaginationChanged(self, _currentSpineItem);
            _$iframe.css('opacity',1);
        }, 50);

    }

    function openDeferredElement() {

        if(!_deferredPageRequest) {
            return;
        }

        var deferredData = _deferredPageRequest;
        _deferredPageRequest = undefined;
        self.openPage(deferredData);

    }

    this.applyStyles = function() {

        ReadiumSDK.Helpers.setStyles(_userStyles.getStyles(), _$el.parent());

        //because left, top, bottom, right setting ignores padding of parent container
        //we have to take it to account manually
        var elementMargins = ReadiumSDK.Helpers.Margins.fromElement(_$el);
        setFrameSizesToRectangle(elementMargins.padding);

    };

    this.applyBookStyles = function() {

        if(_$epubHtml) {
            ReadiumSDK.Helpers.setStyles(_bookStyles.getStyles(), _$epubHtml);
        }
    };


    this.openPage = function(pageRequest) {

        // if no spine item specified we are talking about current spine item
        if(pageRequest.spineItem && pageRequest.spineItem != _currentSpineItem) {
            _deferredPageRequest = pageRequest;
            loadSpineItemPageRequest(pageRequest);
            return;
        }

        var topOffset = 0;
        var pageCount;
        var $element;

        if(pageRequest.scrollTop !== undefined) {

            topOffset = pageRequest.scrollTop;
        }
        else if(pageRequest.spineItemPageIndex !== undefined) {

            var pageIndex;
            pageCount = calculatePageCount();
            if(pageRequest.spineItemPageIndex < 0) {
                pageIndex = 0;
            }
            else if(pageRequest.spineItemPageIndex >= pageCount) {
                pageIndex = pageCount - 1;
            }
            else {
                pageIndex = pageRequest.spineItemPageIndex;
            }

            topOffset = pageIndex * viewHeight();
        }
        else if(pageRequest.elementId) {

            $element = _navigationLogic.getElementById(pageRequest.elementId);

            if(!$element) {
                console.warn("Element id=" + pageRequest.elementId + " not found!");
                return;
            }

            topOffset = _navigationLogic.getVerticalOffsetForElement($element);
        }
        else if(pageRequest.elementCfi) {

            try
            {
                $element = _navigationLogic.getElementByCfi(pageRequest.elementCfi,
                    ["cfi-marker", "mo-cfi-highlight"],
                    [],
                    ["MathJax_Message"]);
            }
            catch (e)
            {
                $element = undefined;
                console.log(e);
            }

            if(!$element) {
                console.warn("Element cfi=" + pageRequest.elementCfi + " not found!");
                return;
            }

            topOffset = _navigationLogic.getVerticalOffsetForElement($element);
        }
        else if(pageRequest.firstPage) {

            topOffset = 0;
        }
        else if(pageRequest.lastPage) {
            pageCount = calculatePageCount();

            if(pageCount === 0) {
                return;
            }

            topOffset = scrollHeightSynced() - viewHeight() - 5;
        }
        else {
            console.debug("No criteria in pageRequest");
        }

        if(scrollTop() != topOffset ) {
            //store request for onScroll event
            _pageRequest = pageRequest;
            scrollTo(topOffset);
        }
    };

    function scrollTo(offset) {
        _$contentFrame.animate({
            scrollTop: offset
        }, 50);
    }

    function calculatePageCount() {

        return Math.ceil(scrollHeight() / viewHeight());
    }

    function onPaginationChanged(initiator, paginationRequest_spineItem, paginationRequest_elementId) {

        self.trigger(ReadiumSDK.InternalEvents.CURRENT_VIEW_PAGINATION_CHANGED, { paginationInfo: self.getPaginationInfo(), initiator: initiator, spineItem: paginationRequest_spineItem, elementId: paginationRequest_elementId } );
    }

    function scrollTop() {
        return  _$contentFrame.scrollTop()
    }

    function scrollBottom() {
        return scrollHeightSynced() - (scrollTop() + viewHeight());
    }

    function getCurrentPageIndex() {

        return Math.ceil(scrollTop() / _$contentFrame.height());
    }

    function viewHeight() {
        return _$contentFrame.height();
    }

    function scrollHeight() {

        return _$contentFrame[0].scrollHeight;
    }

    function scrollHeightSynced() {
        //Whenever the scrollHeight value needs to be fetched:
        // synchronize the content document height with the iframe height
        var height = _$contentFrame[0].scrollHeight;
        var contHeight = contentHeight();
        if (height != contHeight) {
            setIframeHeight(contHeight);
        }
        return scrollHeight();
    }


    function contentHeight() {
        return _$epubHtml[0].scrollHeight;
    }

    this.openPagePrev = function (initiator) {

        if(!_currentSpineItem) {
            return;
        }

        var pageRequest;

        if(scrollTop() > 0) {

            pageRequest = new ReadiumSDK.Models.PageOpenRequest(_currentSpineItem, initiator);
            pageRequest.scrollTop = scrollTop() - (viewHeight() - SCROLL_MARGIN_TO_SHOW_LAST_VISBLE_LINE);
            if(pageRequest.scrollTop < 0) {
                pageRequest.scrollTop = 0;
            }

        }
        else {

            var prevSpineItem = _spine.prevItem(_currentSpineItem);
            if(prevSpineItem) {

                pageRequest = new ReadiumSDK.Models.PageOpenRequest(prevSpineItem, initiator);
                pageRequest.scrollTop = scrollHeightSynced() - viewHeight();
            }

        }

        if(pageRequest) {
            self.openPage(pageRequest);
        }
    };

    this.openPageNext = function (initiator) {

        if(!_currentSpineItem) {
            return;
        }

        var pageRequest;

        if(scrollBottom() > 0) {

            pageRequest = new ReadiumSDK.Models.PageOpenRequest(_currentSpineItem, initiator);
            pageRequest.scrollTop = scrollTop() + Math.min(scrollBottom(), viewHeight() - SCROLL_MARGIN_TO_SHOW_LAST_VISBLE_LINE);

        }
        else {

            var nextSpineItem = _spine.nextItem(_currentSpineItem);
            if(nextSpineItem) {

                pageRequest = new ReadiumSDK.Models.PageOpenRequest(nextSpineItem, initiator);
                pageRequest.scrollTop = 0;
            }
        }

        if(pageRequest) {
            self.openPage(pageRequest);
        }
    };


    this.getFirstVisibleElementCfi = function() {

        return _navigationLogic.getFirstVisibleElementCfi(scrollTop());
    };

    this.getPaginationInfo = function() {

        var paginationInfo = new ReadiumSDK.Models.CurrentPagesInfo(_spine.items.length, false, _spine.direction);

        if(!_currentSpineItem) {
            return paginationInfo;
        }

        paginationInfo.addOpenPage(getCurrentPageIndex(), calculatePageCount(), _currentSpineItem.idref, _currentSpineItem.index);

        return paginationInfo;

    };


    this.bookmarkCurrentPage = function() {

        if(!_currentSpineItem) {

            return undefined;
        }

        return new ReadiumSDK.Models.BookmarkData(_currentSpineItem.idref, self.getFirstVisibleElementCfi());
    };


    this.getLoadedSpineItems = function() {
        return [_currentSpineItem];
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

        return _navigationLogic.getFirstVisibleMediaOverlayElement(visibleOffsets());
    };

    function visibleOffsets() {

        return {

            top: scrollTop(),
            bottom: scrollTop() + viewHeight()
        }
    }

    this.insureElementVisibility = function(element, initiator) {

        var $element = $(element);


        if(_navigationLogic.getElementVisibility($element, visibleOffsets()) > 0) {
            return;
        }

        var page = _navigationLogic.getPageForElement($element);

        if(page == -1) {
            return;
        }

        var openPageRequest = new ReadiumSDK.Models.PageOpenRequest(_currentSpineItem, initiator);
        openPageRequest.setPageIndex(page);

        self.openPage(openPageRequest);
    };

    this.getVisibleElementsWithFilter = function(filterFunction) {

        console.warn('getVisibleElementsWithFilter: Not implemented for IE9 fallback view');
    };

    this.getVisibleElements = function(selector, includeSpineItems) {

        console.warn('getVisibleElements: Not implemented for IE9 fallback view');
    };

    this.isElementVisible = function($element){

        console.warn('isElementVisible: Not implemented for IE9 fallback view');
    };

    this.getElements = function(spineItem, selector) {

        if(spineItem != _currentSpineItem) {
            console.error("spine item is not loaded");
            return undefined;
        }

        return _navigationLogic.getElements(selector);
    };

    this.isNodeFromRangeCfiVisible = function (spineIdref, partialCfi) {
        if (_currentSpineItem.idref === spineIdref) {
            return _navigationLogic.isNodeFromRangeCfiVisible(partialCfi);
        }
        return undefined;
    };

    this.isVisibleSpineItemElementCfi = function (spineIdRef, partialCfi) {
        if (_navigationLogic.isRangeCfi(partialCfi)) {
            return this.isNodeFromRangeCfiVisible(spineIdRef, partialCfi);
        }
        var spineItem = _spine.getItemById(spineIdRef);
        var $elementFromCfi = this.getElementByCfi(spineItem, partialCfi);
        return ($elementFromCfi && this.isElementVisible($elementFromCfi));
    };

    this.getLoadedContentFrames = function () {
        return [{spineItem: _currentSpineItem, $iframe: _$iframe}];
    };
};
