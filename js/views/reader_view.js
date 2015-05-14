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

/**
 * Options passed on the reader from the readium loader/initializer
 *
 * @typedef {object} ReadiumSDK.Views.ReaderView.ReaderOptions
 * @property {jQueryElement|string} el   The element the reader view should create itself in. Can be a jquery wrapped element or a query selector.
 * @property {ReadiumSDK.Views.IFrameLoader} iframeLoader   An instance of an iframe loader or one expanding it.
 * @property {boolean} needsFixedLayoutScalerWorkAround
 */

/**
 * Top level View object. Interface for view manipulation public APIs
 * @param {ReadiumSDK.Views.ReaderView.ReaderOptions} options
 * @constructor
 */
ReadiumSDK.Views.ReaderView = function(options) {

    _.extend(this, Backbone.Events);

    var self = this;
    var _currentView = undefined;
    var _package = undefined;
    var _spine = undefined;
    var _viewerSettings = new ReadiumSDK.Models.ViewerSettings({});
    //styles applied to the container divs
    var _userStyles = new ReadiumSDK.Collections.StyleCollection();
    //styles applied to the content documents
    var _bookStyles = new ReadiumSDK.Collections.StyleCollection();
    var _internalLinksSupport = new ReadiumSDK.Views.InternalLinksSupport(this);
    var _mediaOverlayPlayer;
    var _mediaOverlayDataInjector;
    var _iframeLoader;
    var _$el;
    var _annotationsManager = new ReadiumSDK.Views.AnnotationsManager(self, options);

    //We will call onViewportResize after user stopped resizing window
    var lazyResize = ReadiumSDK.Helpers.extendedThrottle(
        handleViewportResizeStart,
        handleViewportResizeTick,
        handleViewportResizeEnd, 250, 1000, self);

    $(window).on("resize.ReadiumSDK.readerView", lazyResize);

    if (options.el instanceof $) {
        _$el = options.el;
        console.log("** EL is a jQuery selector:" + options.el.attr('id'));
    } else {
        _$el = $(options.el);
        console.log("** EL is a string:" + _$el.attr('id'));
    }

    if(options.iframeLoader) {
        _iframeLoader = options.iframeLoader;
    }
    else {
        _iframeLoader = new ReadiumSDK.Views.IFrameLoader({ mathJaxUrl: options.mathJaxUrl});
    }


    _needsFixedLayoutScalerWorkAround = options.needsFixedLayoutScalerWorkAround;
    /**
     * @returns {boolean}
     */
    this.needsFixedLayoutScalerWorkAround = function() { return _needsFixedLayoutScalerWorkAround; }

    /**
     * Create a view based on the given view type.
     * @param {ReadiumSDK.Views.ReaderView.ViewType} viewType
     * @param {ReadiumSDK.Views.ReaderView.ViewCreationOptions} options
     * @returns {*}
     */
    this.createViewForType = function(viewType, options) {
        var createdView;

        // NOTE: _$el == options.$viewport
        _$el.css("overflow", "hidden");

        switch(viewType) {
            case ReadiumSDK.Views.ReaderView.VIEW_TYPE_FIXED:

                _$el.css("overflow", "auto"); // for content pan, see self.setZoom()

                createdView = new ReadiumSDK.Views.FixedView(options, self);
                break;
            case ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_DOC:
                createdView = new ReadiumSDK.Views.ScrollView(options, false, self);
                break;
            case ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS:
                createdView = new ReadiumSDK.Views.ScrollView(options, true, self);
                break;
            default:
                if (window.Modernizr && !window.Modernizr.csscolumns) {
                    // IE9 doesn't support columnization, instead use a scroll doc view
                    createdView = new ReadiumSDK.Views.FallbackScrollView(options, false);
                    break;
                }
                createdView = new ReadiumSDK.Views.ReflowableView(options, self);
                break;
        }

        return createdView;
    };

    /**
     * Returns the current view type of the reader view
     * @returns {ReaderView.ViewType}
     */
    this.getCurrentViewType = function() {

        if(!_currentView) {
            return undefined;
        }

        if(_currentView instanceof ReadiumSDK.Views.ReflowableView) {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_COLUMNIZED;
        }

        if(_currentView instanceof ReadiumSDK.Views.FixedView) {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_FIXED;
        }

        if(_currentView instanceof ReadiumSDK.Views.ScrollView) {
            if(_currentView.isContinuousScroll()) {
                return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS;
            }

            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_DOC;
        }

        if(_currentView instanceof ReadiumSDK.Views.FallbackScrollView) {
            // fake a columnized view because it's a fallback of it
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_COLUMNIZED;
        }

        console.error("Unrecognized view type");
        return undefined;
    };

    //based on https://docs.google.com/spreadsheet/ccc?key=0AoPMUkQhc4wcdDI0anFvWm96N0xRT184ZE96MXFRdFE&usp=drive_web#gid=0 document
    function deduceDesiredViewType(spineItem) {

        //check settings
        if(_viewerSettings.scroll == "scroll-doc") {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_DOC;
        }

        if(_viewerSettings.scroll == "scroll-continuous") {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS;
        }

        //is fixed layout ignore flow
        if(spineItem.isFixedLayout()) {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_FIXED;
        }

        //flow
        if(spineItem.isFlowScrolledDoc()) {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_DOC;
        }

        if(spineItem.isFlowScrolledContinuous()) {
            return ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS;
        }

        return ReadiumSDK.Views.ReaderView.VIEW_TYPE_COLUMNIZED;
    }

    // returns true is view changed
    function initViewForItem(spineItem, callback) {

        var desiredViewType = deduceDesiredViewType(spineItem);

        if(_currentView) {

            if(self.getCurrentViewType() == desiredViewType) {
                callback(false);
                return;
            }

            resetCurrentView();
        }

        /**
         * View creation options
         * @typedef {object} ReadiumSDK.Views.ReaderView.ViewCreationOptions
         * @property {jQueryElement} $viewport  The view port element the reader view has created.
         * @property {ReadiumSDK.Models.Spine} spine The spine item collection object
         * @property {ReadiumSDK.Collections.StyleCollection} userStyles User styles
         * @property {ReadiumSDK.Collections.StyleCollection} bookStyles Book styles
         * @property {ReadiumSDK.Views.IFrameLoader} iframeLoader   An instance of an iframe loader or one expanding it.
         */
        var viewCreationParams = {
            $viewport: _$el,
            spine: _spine,
            userStyles: _userStyles,
            bookStyles: _bookStyles,
            iframeLoader: _iframeLoader
        };


        _currentView = self.createViewForType(desiredViewType, viewCreationParams);
        self.trigger(ReadiumSDK.Events.READER_VIEW_CREATED, desiredViewType);

        _currentView.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function($iframe, spineItem) {

            if (!ReadiumSDK.Helpers.isIframeAlive($iframe[0])) return;

            // performance degrades with large DOM (e.g. word-level text-audio sync)
            _mediaOverlayDataInjector.attachMediaOverlayData($iframe, spineItem, _viewerSettings);

            _internalLinksSupport.processLinkElements($iframe, spineItem);
            _annotationsManager.attachAnnotations($iframe, spineItem, self.getLoadedSpineItems());

            var contentDoc = $iframe[0].contentDocument;
            ReadiumSDK.Models.Trigger.register(contentDoc);
            ReadiumSDK.Models.Switches.apply(contentDoc);

            self.trigger(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, $iframe, spineItem);
        });

        _currentView.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function ($iframe, spineItem) {
            self.trigger(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, $iframe, spineItem);
        });

        _currentView.on(ReadiumSDK.InternalEvents.CURRENT_VIEW_PAGINATION_CHANGED, function( pageChangeData, preventPublicTrigger ){

            //we call on onPageChanged explicitly instead of subscribing to the ReadiumSDK.Events.PAGINATION_CHANGED by
            //mediaOverlayPlayer because we hve to guarantee that mediaOverlayPlayer will be updated before the host
            //application will be notified by the same ReadiumSDK.Events.PAGINATION_CHANGED event
            _mediaOverlayPlayer.onPageChanged(pageChangeData);

            // This event trigger can be prevented if in some cases the page change action did not cause a view to redraw.
            // Reading systems may do expensive operations on this event hook so we should not trigger it when the pagination state stayed the same.
            if(!preventPublicTrigger){
                _.defer(function(){
                    self.trigger(ReadiumSDK.Events.PAGINATION_CHANGED, pageChangeData);
                });
            }

        });

        // automatically redraw annotations.
        self.on(ReadiumSDK.Events.PAGINATION_CHANGED, _.debounce(function () {
            self.redrawAnnotations();
        }, 10, true));


        _currentView.on(ReadiumSDK.Events.FXL_VIEW_RESIZED, function(){
            self.trigger(ReadiumSDK.Events.FXL_VIEW_RESIZED);
        });

        _currentView.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function($iframe, spineItem) {
            self.trigger(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, $iframe, spineItem);
        });

        _currentView.render();
        _currentView.setViewSettings(_viewerSettings);

        // we do this to wait until elements are rendered otherwise book is not able to determine view size.
        setTimeout(function(){

            callback(true);

        }, 50);

    }

    /**
     * Returns a list of the currently active spine items
     *
     * @returns {ReadiumSDK.Models.SpineItem[]}
     */
    this.getLoadedSpineItems = function() {

        if(_currentView) {
            return _currentView.getLoadedSpineItems();
        }

        return [];
    };

    function resetCurrentView() {

        if(!_currentView) {
            return;
        }

        _currentView.off(ReadiumSDK.InternalEvents.CURRENT_VIEW_PAGINATION_CHANGED);

        _currentView.remove();
        _currentView = undefined;
    }

    /**
     * Returns the currently instanced viewer settings
     *
     * @returns {ReadiumSDK.Models.ViewerSettings}
     */
    this.viewerSettings = function() {
        return _viewerSettings;
    };

    /**
     * Returns a data object based on the package document
     *
     * @returns {ReadiumSDK.Models.Package}
     */
    this.package = function() {
        return _package;
    };

    /**
     * Returns a representation of the spine as a data object, also acts as list of spine items
     *
     * @returns {ReadiumSDK.Models.Spine}
     */
    this.spine = function() {
        return _spine;
    };

    /**
     * Returns the user CSS styles collection
     *
     * @returns {ReadiumSDK.Collections.StyleCollection}
     */
    this.userStyles = function() {
        return _userStyles;
    };

    /**
     * Open Book Data
     *
     * @typedef {object} ReadiumSDK.Views.ReaderView.OpenBookData
     * @property {ReadiumSDK.Models.Package} package - packageData (required)
     * @property {ReadiumSDK.Models.PageOpenRequest} openPageRequest - openPageRequestData, (optional) data related to open page request
     * @property {ReadiumSDK.Views.ReaderView.SettingsData} [settings]
     * @property {ReadiumSDK.Collections.StyleCollection} [styles]
     * @todo Define missing types
     */

    /**
     * Triggers the process of opening the book and requesting resources specified in the packageData
     *
     * @param {ReadiumSDK.Views.ReaderView.OpenBookData} openBookData - object with open book data
     */
    this.openBook = function(openBookData) {

        var packageData = openBookData.package ? openBookData.package : openBookData;

        _package = new ReadiumSDK.Models.Package(packageData);

        _spine = _package.spine;
        _spine.handleLinear(true);

        if(_mediaOverlayPlayer) {
            _mediaOverlayPlayer.reset();
        }

        _mediaOverlayPlayer = new ReadiumSDK.Views.MediaOverlayPlayer(self, $.proxy(onMediaPlayerStatusChanged, self));
        _mediaOverlayPlayer.setAutomaticNextSmil(_viewerSettings.mediaOverlaysAutomaticPageTurn ? true : false); // just to ensure the internal var is set to the default settings (user settings are applied below at self.updateSettings(openBookData.settings);)

        _mediaOverlayDataInjector = new ReadiumSDK.Views.MediaOverlayDataInjector(_package.media_overlay, _mediaOverlayPlayer);


        resetCurrentView();

        if(openBookData.settings) {
            self.updateSettings(openBookData.settings);
        }

        if(openBookData.styles) {
            self.setStyles(openBookData.styles);
        }

        var pageRequestData = undefined;

        if(openBookData.openPageRequest) {

            if(openBookData.openPageRequest.idref || (openBookData.openPageRequest.contentRefUrl && openBookData.openPageRequest.sourceFileHref)) {
                pageRequestData = openBookData.openPageRequest;
            }
            else {
                console.log("Invalid page request data: idref required!");
            }
        }

        var  fallback = false;
        if(pageRequestData) {

            pageRequestData = openBookData.openPageRequest;

            try {
                if(pageRequestData.idref) {

                    if(pageRequestData.spineItemPageIndex) {
                        fallback = !self.openSpineItemPage(pageRequestData.idref, pageRequestData.spineItemPageIndex, self);
                    }
                    else if(pageRequestData.elementCfi) {
                        fallback = !self.openSpineItemElementCfi(pageRequestData.idref, pageRequestData.elementCfi, self);
                    }
                    else {
                        fallback = !self.openSpineItemPage(pageRequestData.idref, 0, self);
                    }
                }
                else {
                    fallback = !self.openContentUrl(pageRequestData.contentRefUrl, pageRequestData.sourceFileHref, self);
                }
            } catch (err) {
                console.error("openPageRequest fail: fallback to first page!")
                console.log(err);
                fallback = true;
            }
        }
        else { fallback = true; }

        if (fallback) {// if we where not asked to open specific page we will open the first one

            var spineItem = _spine.first();
            if(spineItem) {
                var pageOpenRequest = new ReadiumSDK.Models.PageOpenRequest(spineItem, self);
                pageOpenRequest.setFirstPage();
                openPage(pageOpenRequest, 0);
            }

        }

    };

    function onMediaPlayerStatusChanged(status) {
        self.trigger(ReadiumSDK.Events.MEDIA_OVERLAY_STATUS_CHANGED, status);
    }

    /**
     * Flips the page from left to right. Takes to account the page progression direction to decide to flip to prev or next page.
     *
     * @returns {boolean} True if page successfully opened, false if page failed to open, undefined if the result is undetermined (as this depends on child view implementations)
     */
    this.openPageLeft = function() {

        if(_package.spine.isLeftToRight()) {
            return self.openPagePrev();
        }
        else {
            return self.openPageNext();
        }
    };

    /**
     * Flips the page from right to left. Takes to account the page progression direction to decide to flip to prev or next page.
     *
     * @returns {boolean} True if page successfully opened, false if page failed to open, undefined if the result is undetermined (as this depends on child view implementations)
     */
    this.openPageRight = function() {

        if(_package.spine.isLeftToRight()) {
            return self.openPageNext();
        }
        else {
            return self.openPagePrev();
        }

    };

    /**
     * Returns if the current child view is an instance of a fixed page view
     *
     * @returns {boolean}
     */
    this.isCurrentViewFixedLayout = function() {
        return _currentView instanceof ReadiumSDK.Views.FixedView;
    };

    /**
     * Zoom options
     *
     * @typedef {object} ReadiumSDK.Views.ReaderView.ZoomOptions
     * @property {string} style - "user"|"fit-screen"|"fit-width"
     * @property {number} scale - 0.0 to 1.0
     */

    /**
     * Set the zoom options.
     *
     * @param {ReadiumSDK.Views.ReaderView.ZoomOptions} zoom Zoom options
     */
    this.setZoom = function(zoom) {
        // zoom only handled by fixed layout views
        if (self.isCurrentViewFixedLayout()) {
            _currentView.setZoom(zoom);
        }
    };

    /**
     * Returns the current view scale as a percentage
     *
     * @returns {number}
     */
    this.getViewScale = function() {
        if (self.isCurrentViewFixedLayout()) {
            return 100 * _currentView.getViewScale();
        }
        else {
            return 100;
        }
    };

    /**
     * Settings Data
     *
     * @typedef {object} ReadiumSDK.Views.ReaderView.SettingsData
     * @property {number} fontSize - Font size as percentage
     * @property {(string|boolean)} syntheticSpread - "auto"|true|false
     * @property {(string|boolean)} scroll - "auto"|true|false
     * @property {boolean} doNotUpdateView - Indicates whether the view should be updated after the settings are applied
     * @property {boolean} mediaOverlaysEnableClick - Indicates whether media overlays are interactive on mouse clicks
     */

    /**
     * Updates reader view based on the settings specified in settingsData object
     *
     * @param {ReadiumSDK.Views.ReaderView.SettingsData} settingsData Settings data
     * @fires ReadiumSDK.Events.SETTINGS_APPLIED
     */
    this.updateSettings = function(settingsData) {

//console.debug("UpdateSettings: " + JSON.stringify(settingsData));

        _viewerSettings.update(settingsData);

        if (_mediaOverlayPlayer)
        {
            _mediaOverlayPlayer.setAutomaticNextSmil(_viewerSettings.mediaOverlaysAutomaticPageTurn ? true : false);
        }

        if(_currentView && !settingsData.doNotUpdateView) {

            var bookMark = _currentView.bookmarkCurrentPage();

            if(bookMark && bookMark.idref) {

                var wasPlaying = false;
                if (_currentView.isReflowable && _currentView.isReflowable())
                {
                    wasPlaying = self.isPlayingMediaOverlay();
                    if (wasPlaying)
                    {
                        self.pauseMediaOverlay();
                    }
                }

                var spineItem = _spine.getItemById(bookMark.idref);

                initViewForItem(spineItem, function(isViewChanged){

                    if(!isViewChanged) {
                        _currentView.setViewSettings(_viewerSettings);
                    }

                    self.openSpineItemElementCfi(bookMark.idref, bookMark.contentCFI, self);

                    if (wasPlaying)
                    {
                        self.playMediaOverlay();
                        // setTimeout(function()
                        // {
                        // }, 60);
                    }

                    self.trigger(ReadiumSDK.Events.SETTINGS_APPLIED);
                    return;
                });
            }
        }

        self.trigger(ReadiumSDK.Events.SETTINGS_APPLIED);
    };

    /**
     * Opens the next page.
     *
     * @returns {boolean} True if page successfully opened, false if page failed to open, undefined if the result is undetermined (as this depends on child view implementations)
     */
    this.openPageNext = function() {

        if(self.getCurrentViewType() === ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS) {
            _currentView.openPageNext(self);
            return;
        }

        var paginationInfo = _currentView.getPaginationInfo();

        if(paginationInfo.openPages.length == 0) {
            return false;
        }

        var lastOpenPage = paginationInfo.openPages[paginationInfo.openPages.length - 1];

        if(lastOpenPage.spineItemPageIndex < lastOpenPage.spineItemPageCount - 1) {
            return _currentView.openPageNext(self);
        }

        var currentSpineItem = _spine.getItemById(lastOpenPage.idref);

        var nextSpineItem = _spine.nextItem(currentSpineItem);

        if(!nextSpineItem) {
            return false;
        }

        var openPageRequest = new ReadiumSDK.Models.PageOpenRequest(nextSpineItem, self);
        openPageRequest.setFirstPage();

        return openPage(openPageRequest, 2);
    };

    /**
     * Opens the previous page.
     *
     * @returns {boolean} True if page successfully opened, false if page failed to open, undefined if the result is undetermined (as this depends on child view implementations)
     */
    this.openPagePrev = function() {

        if(self.getCurrentViewType() === ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS) {
            _currentView.openPagePrev(self);
            return;
        }

        var paginationInfo = _currentView.getPaginationInfo();

        if(paginationInfo.openPages.length == 0) {
            return false;
        }

        var firstOpenPage = paginationInfo.openPages[0];

        if(firstOpenPage.spineItemPageIndex > 0) {

            return _currentView.openPagePrev(self);
        }

        var currentSpineItem = _spine.getItemById(firstOpenPage.idref);

        var prevSpineItem = _spine.prevItem(currentSpineItem);

        if(!prevSpineItem) {
            return false;
        }

        var openPageRequest = new ReadiumSDK.Models.PageOpenRequest(prevSpineItem, self);
        openPageRequest.setLastPage();

        return openPage(openPageRequest, 1);
    };

    function getSpineItem(idref) {

        if(!idref) {

            console.log("idref parameter value missing!");
            return undefined;
        }

        var spineItem = _spine.getItemById(idref);
        if(!spineItem) {
            console.log("Spine item with id " + idref + " not found!");
            return undefined;
        }

        return spineItem;

    }

    /**
     * Opens the page of the spine item with element with provided cfi
     *
     * @param {string} idref Id of the spine item
     * @param {string} elementCfi CFI of the element to be shown
     * @param {object} initiator optional
     */
    this.openSpineItemElementCfi = function(idref, elementCfi, initiator) {

        var spineItem = getSpineItem(idref);

        if(!spineItem) {
            return false;
        }

        var pageData = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);
        if(elementCfi && elementCfi !== '') {
            pageData.setElementCfi(elementCfi);
        }

        openPage(pageData, 0);

        return true;
    };

    /**
     * Opens specified page index of the current spine item
     *
     * @param {number} pageIndex Zero based index of the page in the current spine item
     * @param {object} initiator optional
     */
    this.openPageIndex = function(pageIndex, initiator) {

        if(!_currentView) {
            return false;
        }

        var pageRequest;

        if(_package.isFixedLayout()) {
            var spineItem = _spine.items[pageIndex];
            if(!spineItem) {
                return false;
            }

            pageRequest = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);
            pageRequest.setPageIndex(0);
        }
        else {

            var spineItems = this.getLoadedSpineItems();
            if(spineItems.length > 0) {
                pageRequest = new ReadiumSDK.Models.PageOpenRequest(spineItems[0], initiator);
                if (pageIndex === -1) {
                    pageRequest.setLastPage();
                } else {
                    pageRequest.setPageIndex(pageIndex);
                }

            }
        }

        openPage(pageRequest, 0);

        return true;
    };


    /**
     * Opens spine item by a specified index
     *
     * @param {number} spineIndex Zero based index of the spine item
     * @param {object} initiator optional
     */
    this.openSpineItemByIndex = function(spineIndex, initiator) {

        if(!_currentView) {
            return;
        }

        var pageRequest;
        var spineItem;
        if (spineIndex === -1) {
            spineItem = _spine.last();
        } else {
            spineItem = _spine.items[spineIndex];
        }

        if(!spineItem) {
            return;
        }

        pageRequest = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);
        pageRequest.setPageIndex(0);
        openPage(pageRequest);
    };

    // dir: 0 => new or same page, 1 => previous, 2 => next
    function openPage(pageRequest, dir) {

        initViewForItem(pageRequest.spineItem, function(isViewChanged){

            if(!isViewChanged) {
                _currentView.setViewSettings(_viewerSettings);
            }

            _currentView.openPage(pageRequest, dir);
        });
    }

    /**
     * Opens page index of the spine item with idref provided
     *
     * @param {string} idref Id of the spine item
     * @param {number} pageIndex Zero based index of the page in the spine item
     * @param {object} initiator optional
     */
    this.openSpineItemPage = function(idref, pageIndex, initiator) {

        var spineItem = getSpineItem(idref);

        if(!spineItem) {
            return false;
        }

        var pageData = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);
        if(pageIndex) {
            pageData.setPageIndex(pageIndex);
        }

        openPage(pageData, 0);

        return true;
    };

    /**
     * Set CSS Styles to the reader container
     *
     * @param {ReadiumSDK.Collections.StyleCollection} styles   Style collection containing selector property and declarations object
     * @param {boolean} doNotUpdateView                         Whether to update the view after the styles are applied.
     */
    this.setStyles = function(styles, doNotUpdateView) {

        var count = styles.length;

        for(var i = 0; i < count; i++) {
            if (styles[i].declarations)
            {
                _userStyles.addStyle(styles[i].selector, styles[i].declarations);
            }
            else
            {
                _userStyles.removeStyle(styles[i].selector);
            }
        }

        applyStyles(doNotUpdateView);

    };

    /**
     * Set CSS Styles to the content documents
     *
     * @param {ReadiumSDK.Collections.StyleCollection} styles    Style collection containing selector property and declarations object
     */
    this.setBookStyles = function(styles) {

        var count = styles.length;

        for(var i = 0; i < count; i++) {
            _bookStyles.addStyle(styles[i].selector, styles[i].declarations);
        }

        if(_currentView) {
            _currentView.applyBookStyles();
        }

    };

    /**
     * Gets an element from active content documents based on a query selector.
     *
     * @param {string} spineItem       The spine item idref associated with an active content document
     * @param {string} selector                      The query selector
     * @returns {HTMLElement|undefined}
     */
    this.getElement = function(spineItemIdref, selector) {

        if(_currentView) {
            return _currentView.getElement(spineItemIdref, selector);
        }

        return undefined;
    };

    /**
     * Gets an element from active content documents based on an element id.
     *
     * @param {string} spineItemIdref      The spine item idref associated with an active content document
     * @param {string} id                                  The element id
     * @returns {HTMLElement|undefined}
     */
    this.getElementById = function(spineItemIdref, id) {

        if(_currentView) {
            return _currentView.getElementById(spineItemIdref, id);
        }

        return undefined;
    };

    /**
     * Gets an element from active content documents based on a content CFI.
     *
     * @param {string} spineItemIdref     The spine item idref associated with an active content document
     * @param {string} cfi                                The partial content CFI
     * @param {string[]} [classBlacklist]
     * @param {string[]} [elementBlacklist]
     * @param {string[]} [idBlacklist]
     * @returns {HTMLElement|undefined}
     */
    this.getElementByCfi = function(spineItemIdref, cfi, classBlacklist, elementBlacklist, idBlacklist) {

        if(_currentView) {
            return _currentView.getElementByCfi(spineItemIdref, cfi, classBlacklist, elementBlacklist, idBlacklist);
        }

        return undefined;

    };

    function applyStyles(doNotUpdateView) {

        ReadiumSDK.Helpers.setStyles(_userStyles.getStyles(), _$el);

        if (_mediaOverlayPlayer)
            _mediaOverlayPlayer.applyStyles();

        if(doNotUpdateView) return;

        if(_currentView) {
            _currentView.applyStyles();
        }
    }

    /**
     * Opens a content url from a media player context
     *
     * @param {string} contentRefUrl
     * @param {string} sourceFileHref
     * @param offset
     */
    this.mediaOverlaysOpenContentUrl = function(contentRefUrl, sourceFileHref, offset) {
        _mediaOverlayPlayer.mediaOverlaysOpenContentUrl(contentRefUrl, sourceFileHref, offset);
    };



    /**
     * Opens the content document specified by the url
     *
     * @param {string} contentRefUrl Url of the content document
     * @param {string | undefined} sourceFileHref Url to the file that contentRefUrl is relative to. If contentRefUrl is
     * relative ot the source file that contains it instead of the package file (ex. TOC file) We have to know the
     * sourceFileHref to resolve contentUrl relative to the package file.
     * @param {object} initiator optional
     */
    this.openContentUrl = function (contentRefUrl, sourceFileHref, initiator) {

        var contentResolveInfo = self.resolveContentUrl(contentRefUrl, sourceFileHref, initiator);

        if (contentResolveInfo && contentResolveInfo.idref) {
            return self.openSpineItemElementId(contentResolveInfo.idref, contentResolveInfo.elementId, initiator);
        } else {
            return false;
        }
    };

    /**
     * Resolves a content url
     *
     * @param {string} contentRefUrl Url of the content document
     * @param {string | undefined} sourceFileHref Url to the file that contentRefUrl is relative to. If contentRefUrl is
     * relative ot the source file that contains it instead of the package file (ex. TOC file) We have to know the
     * sourceFileHref to resolve contentUrl relative to the package file.
     * @param {object} initiator optional
     */
    this.resolveContentUrl = function(contentRefUrl, sourceFileHref, initiator) {
        var combinedPath = ReadiumSDK.Helpers.ResolveContentRef(contentRefUrl, sourceFileHref);

        var hashIndex = combinedPath.indexOf("#");
        var hrefPart;
        var elementId;
        if(hashIndex >= 0) {
            hrefPart = combinedPath.substr(0, hashIndex);
            elementId = combinedPath.substr(hashIndex + 1);
        }
        else {
            hrefPart = combinedPath;
            elementId = undefined;
        }


        var spineItem = _spine.getItemByHref(hrefPart);
        if(!spineItem) {
            console.warn('spineItem ' + hrefPart + ' not found');
            // sometimes that happens because spine item's URI gets encoded,
            // yet it's compared with raw strings by `getItemByHref()` -
            // so we try to search with decoded link as well
            var decodedHrefPart = decodeURIComponent(hrefPart);
            spineItem = _spine.getItemByHref(decodedHrefPart);
            if (!spineItem) {
                console.warn('decoded spineItem ' + decodedHrefPart + ' missing as well');
                return false;
            }
        }

        return {href: hrefPart, elementId: elementId, idref: spineItem.idref};
    };

    /**
     * Opens the page of the spine item with element with provided cfi
     *
     * @param {string} idref Id of the spine item
     * @param {string} elementId id of the element to be shown
     * @param {object} initiator optional
     */
    this.openSpineItemElementId = function(idref, elementId, initiator) {

        var spineItem = _spine.getItemById(idref);
        if(!spineItem) {
            return false;
        }

        var pageData = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);

        if(elementId){
            pageData.setElementId(elementId);
        }


        openPage(pageData, 0);

        return true;
    };

    /**
     * Returns the bookmark associated with currently opened page.
     *
     * @returns {string} Serialized ReadiumSDK.Models.BookmarkData object as JSON string.
     *          {null} If a bookmark could not be created successfully.
     */
    this.bookmarkCurrentPage = function() {
        var bookmark = _currentView.bookmarkCurrentPage();
        return bookmark ? bookmark.toString() : null;
    };

    /**
     * Resets all the custom styles set by setStyle callers at runtime
     */
    this.clearStyles = function() {

        _userStyles.resetStyleValues();
        applyStyles();
        _userStyles.clear();
    };

    /**
     * Resets all the custom styles set by setBookStyle callers at runtime
     */
    this.clearBookStyles = function() {

        if(_currentView) {

            _bookStyles.resetStyleValues();
            _currentView.applyBookStyles();
        }

        _bookStyles.clear();
    };

    /**
     * Returns true if media overlay available for one of the open pages.
     *
     * @returns {boolean}
     */
    this.isMediaOverlayAvailable = function() {

        if (!_mediaOverlayPlayer) return false;

        return _mediaOverlayPlayer.isMediaOverlayAvailable();
    };

/*
    this.setMediaOverlaySkippables = function(items) {

        _mediaOverlayPlayer.setMediaOverlaySkippables(items);
    };

    this.setMediaOverlayEscapables = function(items) {

        _mediaOverlayPlayer.setMediaOverlayEscapables(items);
    };
*/

    /**
     * Starts/Stop playing media overlay on current page
     */
    this.toggleMediaOverlay = function() {

        _mediaOverlayPlayer.toggleMediaOverlay();
    };


    /**
    * Plays next fragment media overlay
    */
   this.nextMediaOverlay = function() {

        _mediaOverlayPlayer.nextMediaOverlay();

   };

    /**
     * Plays previous fragment media overlay
     */
    this.previousMediaOverlay = function() {

        _mediaOverlayPlayer.previousMediaOverlay();

    };

    /**
     * Plays next available fragment media overlay that is outside of the current escapable scope
     */
    this.escapeMediaOverlay = function() {

        _mediaOverlayPlayer.escape();
    };

    /**
     * End media overlay TTS
     * @todo Clarify what this does with Daniel.
     */
    this.ttsEndedMediaOverlay = function() {

        _mediaOverlayPlayer.onTTSEnd();
    };

    /**
     * Pause currently playing media overlays.
     */
    this.pauseMediaOverlay = function() {

        _mediaOverlayPlayer.pause();
    };

    /**
     * Start/Resume playback of media overlays.
     */
    this.playMediaOverlay = function() {

        _mediaOverlayPlayer.play();
    };

    /**
     * Determine if media overlays are currently playing.
     * @returns {boolean}
     */
    this.isPlayingMediaOverlay = function() {

        return _mediaOverlayPlayer.isPlaying();
    };

//
// should use ReadiumSDK.Events.SETTINGS_APPLIED instead!
//    this.setRateMediaOverlay = function(rate) {
//
//        _mediaOverlayPlayer.setRate(rate);
//    };
//    this.setVolumeMediaOverlay = function(volume){
//
//        _mediaOverlayPlayer.setVolume(volume);
//    };

    /**
     * Get the first visible media overlay element from the currently active content document(s)
     * @returns {HTMLElement|undefined}
     */
    this.getFirstVisibleMediaOverlayElement = function() {

        if(_currentView) {
            return _currentView.getFirstVisibleMediaOverlayElement();
        }

        return undefined;
    };

    /**
     * Used to jump to an element to make sure it is visible when a content document is paginated
     * @param {string}      spineItemId   The spine item idref associated with an active content document
     * @param {HTMLElement} element       The element to make visible
     * @param [initiator]
     */
    this.insureElementVisibility = function(spineItemId, element, initiator) {

        if(_currentView) {
            _currentView.insureElementVisibility(spineItemId, element, initiator);
        }
    };

    var _resizeBookmark = null;
    var _resizeMOWasPlaying = false;

    function handleViewportResizeStart() {

        _resizeBookmark = null;
        _resizeMOWasPlaying = false;

        if (_currentView) {

            if (_currentView.isReflowable && _currentView.isReflowable()) {
                _resizeMOWasPlaying = self.isPlayingMediaOverlay();
                if (_resizeMOWasPlaying) {
                    self.pauseMediaOverlay();
                }
            }

            _resizeBookmark = _currentView.bookmarkCurrentPage(); // not self! (JSON string)
        }
    }

    function handleViewportResizeTick() {
        if (_currentView) {
            self.handleViewportResize(_resizeBookmark);
        }
    }

    function handleViewportResizeEnd() {
        //same as doing one final tick for now
        handleViewportResizeTick();

        if (_resizeMOWasPlaying) self.playMediaOverlay();
    }

    this.handleViewportResize = function(bookmarkToRestore)
    {
        if (!_currentView) return;

        var bookMark = bookmarkToRestore || _currentView.bookmarkCurrentPage(); // not self! (JSON string)

        if (_currentView.isReflowable && _currentView.isReflowable() && bookMark && bookMark.idref)
        {
            var spineItem = _spine.getItemById(bookMark.idref);

            initViewForItem(spineItem, function(isViewChanged)
            {
                self.openSpineItemElementCfi(bookMark.idref, bookMark.contentCFI, self);
                return;
            });
        }
        else
        {
            _currentView.onViewportResize();
        }
    };

    /**
     * Returns current selection partial Cfi, useful for workflows that need to check whether the user has selected something.
     *
     * @returns {object | undefined} partial cfi object or undefined if nothing is selected
     */
    this.getCurrentSelectionCfi =  function() {
        return _annotationsManager.getCurrentSelectionCfi();
    };

    /**
     * Creates a higlight based on given parameters
     *
     * @param {string} spineIdRef		Spine idref that defines the partial Cfi
     * @param {string} cfi				Partial CFI (withouth the indirection step) relative to the spine index
     * @param {string} id				Id of the highlight. must be unique
     * @param {string} type 			Name of the class selector rule in annotations stylesheet.
     * 									The style of the class will be applied to the created hightlight
     * @param {object} styles			Object representing CSS properties to be applied to the highlight.
     * 									e.g., to apply background color pass in: {'background-color': 'green'}
     *
     * @returns {object | undefined} partial cfi object of the created highlight
     */
    this.addHighlight = function(spineIdRef, cfi, id, type, styles) {
        var options = getCfisForVisibleRegion();
        return _annotationsManager.addHighlight(spineIdRef, cfi, id, type, styles, options);
    };

    /**
     * Draw placeholder around element addressed by CFI
     *
     * @param {string} spineIdRef spine idref that defines the partial Cfi
     * @param {string} cfi Partial CFI (withouth the indirection step) relative to the spine index
     * @param {string} id Id of the highlight. must be unique
     * @param {string} type - name of the class selector rule in annotations.css file.
     * The style of the class will be applied to the placeholder
     * @param {object} styles - object representing CSS properties to be applied to the placeholder
     * e.g., to apply background color pass this {'background-color': 'green'}.
     *
     * @returns {object | undefined} partial cfi object of the created placeholder
     */
    this.addPlaceholder = function(spineIdRef, cfi, id, type, styles) {
        // get element by CFI
        var $element = _currentView.getElementByCfi(spineIdRef, cfi);
        if (!$element)
            return undefined;
        return _annotationsManager.addPlaceholder(spineIdRef, cfi, $element, id, type, styles);
    };

    /**
     * Creates a higlight based on the current selection
     *
     * @param {string} id id of the highlight. must be unique
     * @param {string} type - name of the class selector rule in annotations.css file.
     * @param {boolean} clearSelection - set to true to clear the current selection
     * after it is highlighted
     * The style of the class will be applied to the created hightlight
     * @param {object} styles - object representing CSS properties to be applied to the highlight.
     * e.g., to apply background color pass this {'background-color': 'green'}
     *
     * @returns {object | undefined} partial cfi object of the created highlight
     */
    this.addSelectionHighlight =  function(id, type, clearSelection, styles) {
        return _annotationsManager.addSelectionHighlight(id, type, clearSelection, styles);
    };

    /**
     * Higlights all the occurences of the given text
     *
     * @param {string} text array of text occurences to be highlighted
     * @param {string} spineIdRef spine idref where the text is searched for
     * @param {string} type - name of the class selector rule in annotations.css file.
     * The style of the class will be applied to the created hightlights
     * @param {object} styles - object representing CSS properties to be applied to the highlights.
     * e.g., to apply background color pass this {'background-color': 'green'}.
     *
     * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the found text occurences
     */
    this.addHighlightsForText = function(text, spineIdRef, type, styles) {
        return _annotationsManager.addHighlightsForText(text, spineIdRef, type, styles);
    };

    /**
     * Draw placeholders around all "audio" elements in the rendered iFrame
     *
     * @param {string} spineIdRef spine idref where "audio" elements are searched for
     * @param {string} type - name of the class selector rule in annotations.css file.
     * The style of the class will be applied to the placeholders
     * @param {object} styles - object representing CSS properties to be applied to the placeholders.
     * e.g., to apply background color pass this {'background-color': 'green'}.
     *
     * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the placeholders
     */
    this.addPlaceholdersForAudio = function(spineIdRef, type, styles) {
        return _annotationsManager.addPlaceholdersForAudio(spineIdRef, type, styles);
    };

    /**
     * Draw placeholders around all "video" elements in the rendered iFrame
     *
     * @param {string} spineIdRef spine idref where "video" elements are searched for
     * @param {string} type - name of the class selector rule in annotations.css file.
     * The style of the class will be applied to the placeholders
     * @param {object} styles - object representing CSS properties to be applied to the placeholders.
     * e.g., to apply background color pass this {'background-color': 'green'}.
     *
     * @returns {array<ReadiumSDK.Models.BookmarkData> | undefined} array of bookmarks data for the placeholders
     */
    this.addPlaceholdersForVideo = function(spineIdRef, type, styles) {
        return _annotationsManager.addPlaceholdersForVideo(spineIdRef, type, styles);
    };

    /**
     * Removes a given highlight
     *
     * @param {string} id  The id associated with the highlight.
     *
     * @returns {undefined}
     *
     */
    this.removeHighlight = function(id) {
        return _annotationsManager.removeHighlight(id);
    };

    /**
     * Removes highlights of a given type
     *
     * @param {string} type type of the highlight.
     *
     * @returns {undefined}
     *
     */
    this.removeHighlightsByType = function(type) {
        return _annotationsManager.removeHighlightsByType(type);
    };

    /**
     * Client Rectangle
     * @typedef {object} ReadiumSDK.Views.ReaderView.ClientRect
     * @property {number} top
     * @property {number} left
     * @property {number} height
     * @property {number} width
     */

    /**
     * Highlight Info
     *
     * @typedef {object} ReadiumSDK.Views.ReaderView.HighlightInfo
     * @property {string} id - unique id of the highlight
     * @property {string} type - highlight type (css class)
     * @property {string} CFI - partial CFI range of the highlight
     * @property {ReadiumSDK.Views.ReaderView.ClientRect[]} rectangleArray - array of rectangles consituting the highlight
     * @property {string} selectedText - concatenation of highlight nodes' text
     */

    /**
     * Gets given highlight
     *
     * @param {string} id id of the highlight.
     *
     * @returns {ReadiumSDK.Views.ReaderView.HighlightInfo} Object describing the highlight
     */
    this.getHighlight = function(id) {
        return _annotationsManager.getHighlight(id);
    };

    /**
     * Update annotation by the id, reapplies CSS styles to the existing annotaion
     *
     * @param {string} id id of the annotation.
     * @property {string} type - annotation type (name of css class)
     * @param {object} styles - object representing CSS properties to be applied to the annotation.
     * e.g., to apply background color pass this {'background-color': 'green'}.
     */
    this.updateAnnotation = function(id, type, styles) {
        _annotationsManager.updateAnnotation(id, type, styles);
    };

    /**
     * Replace annotation with this id. Current annotation is removed and a new one is created.
     *
     * @param {string} id id of the annotation.
     * @property {string} cfi - partial CFI range of the annotation
     * @property {string} type - annotation type (name of css class)
     * @param {object} styles - object representing CSS properties to be applied to the annotation.
     * e.g., to apply background color pass this {'background-color': 'green'}.
     */
    this.replaceAnnotation = function(id, cfi, type, styles) {
        _annotationsManager.replaceAnnotation(id, cfi, type, styles);
    };

    /**
     * Allows the subscription of events that trigger inside the epub content iframe
     *
     * @param {string} eventName              Event name.
     * @param {function} callback             Callback function.
     * @param {object} context                User specified data passed to the callback function.
     * @param {IframeEventOptions} [options]  Specify additional options
     * @returns {undefined}
     */
    this.addIFrameEventListener = function (eventName, callback, context, options) {
        _iframeLoader.addIFrameEventListener(eventName, callback, context, options);
    };

    /**
     * Re-binds all registered iframe event listeners to the currently loaded content frames.
     *
     * @method updateIFrameEvents
     * @returns {undefined}
     */
    this.updateIFrameEvents = function(){
        var contentFrames = this.getLoadedContentFrames();
        if (contentFrames) {
            _.each(contentFrames, function (contentFrameInfo) {
                _iframeLoader.updateIframeEvents(contentFrameInfo.$iframe[0]);
            });
        }
    };


    var BackgroundAudioTrackManager = function()
    {
        var _spineItemIframeMap = {};
        var _wasPlaying = false;

        var _callback_playPause = undefined;
        this.setCallback_PlayPause = function(callback)
        {
            _callback_playPause = callback;
        };

        var _callback_isAvailable = undefined;
        this.setCallback_IsAvailable = function(callback)
        {
            _callback_isAvailable = callback;
        };

        this.playPause = function(doPlay)
        {
            _playPause(doPlay);
        };

        var _playPause = function(doPlay)
        {
            if (_callback_playPause)
            {
                _callback_playPause(doPlay);
            }

            try
            {
                var $iframe = undefined;

                for (var prop in _spineItemIframeMap)
                {
                    if (!_spineItemIframeMap.hasOwnProperty(prop)) continue;

                    var data = _spineItemIframeMap[prop];
                    if (!data || !data.active) continue;

                    if ($iframe) console.error("More than one active iframe?? (pagination)");

                    $iframe = data["$iframe"];
                    if (!$iframe) continue;

                    var $audios = $("audio", $iframe[0].contentDocument);

                    $.each($audios, function() {

                        var attr = this.getAttribute("epub:type") || this.getAttribute("type");

                        if (!attr) return true; // continue

                        if (attr.indexOf("ibooks:soundtrack") < 0 && attr.indexOf("media:soundtrack") < 0 && attr.indexOf("media:background") < 0) return true; // continue

                        if (doPlay && this.play)
                        {
                            this.play();
                        }
                        else if (this.pause)
                        {
                            this.pause();
                        }

                        return true; // continue (more than one track?)
                    });
                }
            }
            catch (err)
            {
                console.error(err);
            }
        };

        this.setPlayState = function(wasPlaying)
        {
            _wasPlaying = wasPlaying;
        };

        self.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function ($iframe, spineItem)
        {
            try
            {
                if (spineItem && spineItem.idref && $iframe && $iframe[0])
                {
                    // console.log("CONTENT_DOCUMENT_LOADED");
                    // console.debug(spineItem.href);
                    // console.debug(spineItem.idref);

                    _spineItemIframeMap[spineItem.idref] = {"$iframe": $iframe, href: spineItem.href};
                }
            }
            catch (err)
            {
                console.error(err);
            }
        });

        self.on(ReadiumSDK.Events.PAGINATION_CHANGED, function (pageChangeData)
        {
            // console.log("PAGINATION_CHANGED");
            // console.debug(pageChangeData);
            //
            // if (pageChangeData.spineItem)
            // {
            //     console.debug(pageChangeData.spineItem.href);
            //     console.debug(pageChangeData.spineItem.idref);
            // }
            // else
            // {
            //     //console.error(pageChangeData);
            // }
            //
            // if (pageChangeData.paginationInfo && pageChangeData.paginationInfo.openPages && pageChangeData.paginationInfo.openPages.length)
            // {
            //     for (var i = 0; i < pageChangeData.paginationInfo.openPages.length; i++)
            //     {
            //         console.log(pageChangeData.paginationInfo.openPages[i].idref);
            //     }
            // }

            var atLeastOne = false;

            try
            {
                for (var prop in _spineItemIframeMap)
                {
                    if (!_spineItemIframeMap.hasOwnProperty(prop)) continue;

                    var isActive = pageChangeData.spineItem && pageChangeData.spineItem.idref === prop;

                    var isDisplayed = false;

                    if (pageChangeData.paginationInfo && pageChangeData.paginationInfo.openPages.length)
                    {
                        var allSame = true;

                        for (var i = 0; i < pageChangeData.paginationInfo.openPages.length; i++)
                        {
                            if (pageChangeData.paginationInfo.openPages[i].idref === prop)
                            {
                                isDisplayed = true;
                            }
                            else
                            {
                                allSame = false;
                            }
                        }

                        if (!isActive && allSame) isActive = true;
                    }

                    if (isActive || isDisplayed)
                    {
                        var data = _spineItemIframeMap[prop];
                        if (!data) continue;

                        _spineItemIframeMap[prop]["active"] = isActive;

                        var $iframe = data["$iframe"];
                        var href = data.href;

                        var $audios = $("audio", $iframe[0].contentDocument);
                        $.each($audios, function() {

                            var attr = this.getAttribute("epub:type") || this.getAttribute("type");

                            if (!attr) return true; // continue

                            if (attr.indexOf("ibooks:soundtrack") < 0 && attr.indexOf("media:soundtrack") < 0 && attr.indexOf("media:background") < 0) return true; // continue

                            this.setAttribute("loop", "loop");
                            this.removeAttribute("autoplay");

                            // DEBUG!
                            //this.setAttribute("controls", "controls");

                            if (isActive)
                            {
                                // DEBUG!
                                //$(this).css({border:"2px solid green"});
                            }
                            else
                            {
                                if (this.pause) this.pause();

                                // DEBUG!
                                //$(this).css({border:"2px solid red"});
                            }

                            atLeastOne = true;

                            return true; // continue (more than one track?)
                        });

                        continue;
                    }
                    else
                    {
                        if (_spineItemIframeMap[prop]) _spineItemIframeMap[prop]["$iframe"] = undefined;
                        _spineItemIframeMap[prop] = undefined;
                    }
                }
            }
            catch (err)
            {
                console.error(err);
            }

            if (_callback_isAvailable)
            {
                _callback_isAvailable(atLeastOne);
            }

            if (atLeastOne)
            {
                if (_wasPlaying)
                {
                    _playPause(true);
                }
                else
                {
                    _playPause(false); // ensure correct paused state
                }
            }
            else
            {
                _playPause(false); // ensure correct paused state
            }
        });

        self.on(ReadiumSDK.Events.MEDIA_OVERLAY_STATUS_CHANGED, function (value)
        {
            if (!value.smilIndex) return;
            var package = self.package();
            var smil = package.media_overlay.smilAt(value.smilIndex);
            if (!smil || !smil.spineItemId) return;

            var needUpdate = false;
            for (var prop in _spineItemIframeMap)
            {
                if (!_spineItemIframeMap.hasOwnProperty(prop)) continue;

                var data = _spineItemIframeMap[prop];
                if (!data) continue;

                if (data.active)
                {
                    if (prop !== smil.spineItemId)
                    {
                        _playPause(false); // ensure correct paused state
                        data.active = false;
                        needUpdate = true;
                    }
                }
            }

            if (needUpdate)
            {
                for (var prop in _spineItemIframeMap)
                {
                    if (!_spineItemIframeMap.hasOwnProperty(prop)) continue;

                    var data = _spineItemIframeMap[prop];
                    if (!data) continue;

                    if (!data.active)
                    {
                        if (prop === smil.spineItemId)
                        {
                            data.active = true;
                        }
                    }
                }

                if (_wasPlaying)
                {
                    _playPause(true);
                }
            }
        });
    };
    this.backgroundAudioTrackManager = new BackgroundAudioTrackManager();

    /**
     * Redraws all annotations
     */
    this.redrawAnnotations = function(){
        if (_currentView) {
            var options = getCfisForVisibleRegion();
            _annotationsManager.redrawAnnotations(options);
        }
    };

    function getCfisForVisibleRegion() {
        return {firstVisibleCfi: self.getFirstVisibleCfi(), lastVisibleCfi: self.getLastVisibleCfi()};
    }

    /**
     * Updates an annotation to use the supplied styles
     *
     * @param {string} id
     * @param {string} styles
     */
    this.updateAnnotationView = function(id, styles) {
        _annotationsManager.updateAnnotationView(id, styles);
    };

    /**
     * Updates an annotation view state, such as whether its hovered in or not.
     * @param {string} id       The id associated with the highlight.
     * @param {string} state    The state type to be updated
     * @param {string} value    The state value to apply to the highlight
     * @returns {undefined}
     */
    this.setAnnotationViewState = function(id, state, value) {
        return _annotationsManager.setAnnotationViewState(id, state, value);
    };

    /**
     * Updates an annotation view state for all views.
     * @param {string} state    The state type to be updated
     * @param {string} value    The state value to apply to the highlights
     * @returns {undefined}
     */
    this.setAnnotationViewStateForAll = function (state, value) {
        return _annotationsManager.setAnnotationViewStateForAll(state, value);
    };

    /**
     * Gets a list of the visible midpoint positions of all annotations
     *
     * @returns {HTMLElement[]}
     */
    this.getVisibleAnnotationMidpoints = function () {
        if (_currentView) {
            var $visibleElements = _currentView.getVisibleElements(_annotationsManager.getAnnotationsElementSelector(), true);

            var elementMidpoints = _annotationsManager.getAnnotationMidpoints($visibleElements);
            return elementMidpoints || [];
        }
        return [];
    };

    this.createMediaPlaceholders = function () {
        if (_currentView) {
            _currentView.createMediaPlaceholders();
        }
    };

    this.isVisibleSpineItemElementCfi = function(spineIdRef, partialCfi){
        var spineItem = getSpineItem(spineIdRef);

        if (!spineItem) {
            return false;
        }

        if (_currentView) {

            if(!partialCfi || (partialCfi && partialCfi === '')){
                var spines = _currentView.getLoadedSpineItems();
                for(var i = 0, count = spines.length; i < count; i++) {
                    if(spines[i].idref == spineIdRef){
                        return true;
                    }
                }
            }
            return _currentView.isVisibleSpineItemElementCfi(spineIdRef, partialCfi);

        }
        return false;
    };

    /**
     * Gets all elements from active content documents based on a query selector.
     *
     * @param {string} spineItemIdref    The spine item idref associated with the content document
     * @param {string} selector          The query selector
     * @returns {HTMLElement[]}
     */
    this.getElements = function(spineItemIdref, selector) {

        if(_currentView) {
            return _currentView.getElements(spineItemIdref, selector);
        }

        return undefined;
    };

    /**
     * Determine if an element is visible on the active content documents
     *
     * @param {HTMLElement} element The element.
     * @returns {boolean}
     */
    this.isElementVisible = function (element) {
        return _currentView.isElementVisible($(element));

    };

    /**
     * Resolve a range CFI into an object containing info about it.
     * @param {string} spineIdRef    The spine item idref associated with the content document
     * @param {string} partialCfi    The partial CFI that is the range CFI to resolve
     * @returns {ReadiumSDK.Models.NodeRangeInfo}
     */
    this.getNodeRangeInfoFromCfi = function (spineIdRef, partialCfi) {
        if (_currentView && spineIdRef && partialCfi) {
            var nodeRangeInfo = _currentView.getNodeRangeInfoFromCfi(spineIdRef, partialCfi);
            if (nodeRangeInfo) {
                return new ReadiumSDK.Models.NodeRangeInfo(nodeRangeInfo.clientRect)
                    .setStartInfo(nodeRangeInfo.startInfo)
                    .setEndInfo(nodeRangeInfo.endInfo);
            }
        }
        return undefined;
    };

    /**
     * Get the pagination info from the current view
     *
     * @returns {ReadiumSDK.Models.CurrentPagesInfo}
     */
    this.getPaginationInfo = function(){
        return _currentView.getPaginationInfo();
    };


    /**
     * Opens page index of the spine item with index provided
     *
     * @param {string} spineIndex Zero based index of the item in the spine
     * @param {number} pageIndex Zero based index of the page in the spine item
     * @param {object} initiator optional
     */
    this.openSpineIndexPage = function(spineIndex, pageIndex, initiator) {

        var spineItem;
        if (spineIndex === -1) {
            spineItem = _spine.last();
        } else {
            spineItem = _spine.items[spineIndex];
        }
        if(!spineItem) {
            return;
        }

        var pageRequest = new ReadiumSDK.Models.PageOpenRequest(spineItem, initiator);

        if (pageIndex === -1) {
            pageRequest.setLastPage();
        } else if(pageIndex) {
            pageRequest.setPageIndex(pageIndex);
        }

        openPage(pageRequest, 0);
    };

    /**
     * Used to determine if the next page is accessible.
     * Useful for hiding page navigation buttons if the last page of a reading flow is reached.
     *
     * @returns {boolean}
     */
    this.doesNextPageExist = function() {
        //TODO: this logic needs to take account of linear=no support, if that is ever added in
        var _paginationInfo = self.getPaginationInfo();
        var openPages = _paginationInfo.openPages;
        if (!openPages || openPages.length === 0) {
            //no open pages, called on bad state
            return false;
        }
        var currentPage = openPages[openPages.length-1];
        var lastSpineItemIndex = _paginationInfo.spineItemCount -1;
        var lastPageIndex = currentPage.spineItemPageCount -1;
        if (currentPage.spineItemIndex !== lastSpineItemIndex) {
            return true;
        } else {
            return currentPage.spineItemPageIndex !== lastPageIndex;
        }
    };

    /**
     * Used to determine if the previous page is accessible.
     * Useful for hiding page navigation buttons if we are on the first page of a reading flow.
     *
     * @returns {boolean}
     */
    this.doesPreviousPageExist = function() {
        //TODO: this logic needs to take account of linear=no support, if that is ever added in
        var _paginationInfo = self.getPaginationInfo();
        var openPages = _paginationInfo.openPages;
        if (!openPages || openPages.length === 0) {
            //no open pages, called on bad state
            return false;
        }
        var currentPage = openPages[0];
        var firstSpineItemIndex = 0;
        var firstPageIndex = 0;
        if (currentPage.spineItemIndex !== firstSpineItemIndex) {
            return true;
        } else {
            return currentPage.spineItemPageIndex !== firstPageIndex;
        }
    };

    /**
     * Used to determine if the page on the right is accessible.
     * Takes into account of RTL page progression.
     *
     * @returns {boolean}
     */
    this.doesRightPageExist = function(){
        var _paginationInfo = self.getPaginationInfo();
        if (_paginationInfo.pageProgressionDirection === "rtl") {
            return self.doesPreviousPageExist();
        }
        return self.doesNextPageExist();
    };

    /**
     * Used to determine if the page on the left is accessible.
     * Takes into account of RTL page progression.
     *
     * @returns {boolean}
     */
    this.doesLeftPageExist = function(){
        var _paginationInfo = self.getPaginationInfo();
        if (_paginationInfo.pageProgressionDirection === "rtl") {
            return self.doesNextPageExist();
        }
        return self.doesPreviousPageExist();
    };

    this.getRenderedSythenticSpread = function () {
        return self.getPaginationInfo().openPages.length === 2 ? 'double' : 'single';
    };

    /**
     * Loaded content frame information
     *
     * @typedef {object} LoadedContentFrameInfo
     * @property {jQueryElement} $iframe        The content document's iframe element, jquery wrapped.
     * @proptery {ReadiumSDK.Models.SpineItem}  The spine item associated with the content frame.
     */

    /**
     * Get a list of the currently loaded content iframe references, mapped with the respective spine item idrefs.
     * @returns {LoadedContentFrameInfo[]}
     */
    this.getLoadedContentFrames = function () {
        if (_currentView && _currentView.getLoadedContentFrames) {
            return _currentView.getLoadedContentFrames();
        }
        return undefined;
    };

    /**
     * Get CFI of the first element visible in the viewport
     * @returns {ReadiumSDK.Models.BookmarkData}
     */
    this.getFirstVisibleCfi = function() {
        if (_currentView) {
            return _currentView.getFirstVisibleCfi();
        }
        return undefined;
    };

    /**
     * Get CFI of the last element visible in the viewport
     * @returns {ReadiumSDK.Models.BookmarkData}
     */
    this.getLastVisibleCfi = function() {
        if (_currentView) {
            return _currentView.getLastVisibleCfi();
        }
        return undefined;
    };

    /**
     * Gets data for external and internal links, as well as "audio" and "video" elements.
     *
     * @param {ReadiumSDK.Models.BookmarkData} startCfi starting CFI
     * @param {ReadiumSDK.Models.BookmarkData} [endCfi] ending CFI
     * optional - may be omited if startCfi is a range CFI
     * @returns an array of "items" each corresponding to the found "link".
     * For every item we return:
     - type: "external" (for external link), "internal" (for external link), "audio"
     (for audio), "video" (for video)
     - location - element's CFI
     - target - meaningful only for "external"/"internal" - href of the link
     - text - meaningful only for "external"/"internal" - text of the link
     - links - meaningful only for "audio"/"video" - array of sources
     - rectangle - only for "audio"/"video" onscreen coordinates of the element
     */
    this.getLinksFromRangeCfi = function(startCfi, endCfi) {
        var that = this;
        if (_currentView) {
            var domRanges = this.getDomRangesFromRangeCfi(startCfi, endCfi);
            var nodes = [];
            _.each(domRanges, function (domRange) {
                _.each((new rangy.WrappedRange(domRange)).getNodes(), function (node) {
                    nodes.push(node);
                })
            });
            var output = [];
            _.each(nodes, function (node) {
                var item = {};
                var cfi = EPUBcfi.Generator.generateElementCFIComponent(node,
                    ["cfi-marker"],
                    [],
                    ["MathJax_Message"]);
                var idref = null;
                _.each(that.getLoadedContentFrames(), function (frame) {
                    if (node.ownerDocument === frame.$iframe[0].contentDocument) {
                      idref = frame.spineItem.idref;
                    }
                });
                item.location = new ReadiumSDK.Models.BookmarkData(idref, cfi);
                if (node.nodeName === "a") {
                    // getAttribute rather than .href, because .href relative URLs resolved to absolute
                    var href = node.getAttribute("href").trim();
                    item.type = href.match(/^[a-zA-Z]*:\/\//) ? "external" : "internal";
                    item.target = item.type === "external" ? node.href : href;
                    item.text = node.textContent;
                } else if (node.nodeName === "audio" || node.nodeName === "video") {
                    item.type = node.nodeName;
                    item.links = [];

                    // get bounding rectangle for audio/video
                    item.rectangle = {};
                    var rect = node.getBoundingClientRect();
                    item.rectangle.left = Math.ceil(rect.left);
                    item.rectangle.top = Math.ceil(rect.top);
                    item.rectangle.right = Math.ceil(rect.right);
                    item.rectangle.bottom = Math.ceil(rect.bottom);

                    if (node.src != "") {
                        item.links.push(node.getAttribute("src").trim());
                    }
                    _.each(node.querySelectorAll("source"), function (source) {
                        item.links.push(source.getAttribute("src").trim());
                    });
                }
                if (item.type) {
                    output.push(item);
                }
            });
            return output;
        }
        return undefined;
    };

    /**
     *
     * @param {string} rangeCfi
     * @param {string} [rangeCfi2]
     * @param {boolean} [inclusive]
     * @returns {array}
     */
    this.getDomRangesFromRangeCfi = function(rangeCfi, rangeCfi2, inclusive) {
        if (_currentView) {
            if (_currentView.getDomRangesFromRangeCfi) {
                return _currentView.getDomRangesFromRangeCfi(rangeCfi, rangeCfi2, inclusive);
            } else {
                return [_currentView.getDomRangeFromRangeCfi(rangeCfi, rangeCfi2, inclusive)];
            }
        }
        return undefined;
    };

    /**
     *
     * @param {ReadiumSDK.Models.BookmarkData} startCfi starting CFI
     * @param {ReadiumSDK.Models.BookmarkData} [endCfi] ending CFI
     * optional - may be omited if startCfi is a range CFI
     * @param {boolean} [inclusive] optional indicating if the range should be inclusive
     * @returns {array}
     */
    this.getDomRangesFromRangeCfi = function(rangeCfi, rangeCfi2, inclusive) {
        if (_currentView) {
            if (_currentView.getDomRangesFromRangeCfi) {
                return _currentView.getDomRangesFromRangeCfi(rangeCfi, rangeCfi2, inclusive);
            } else {
                return [_currentView.getDomRangeFromRangeCfi(rangeCfi, rangeCfi2, inclusive)];
            }
        }
        return undefined;
    };

    /**
     *
     * @param {ReadiumSDK.Models.BookmarkData} startCfi starting CFI
     * @param {ReadiumSDK.Models.BookmarkData} [endCfi] ending CFI
     * optional - may be omited if startCfi is a range CFI
     * @param {boolean} [inclusive] optional indicating if the range should be inclusive
     * @returns {DOM Range} https://developer.mozilla.org/en-US/docs/Web/API/Range
     */
    this.getDomRangeFromRangeCfi = function(startCfi, endCfi, inclusive) {
        if (_currentView) {
            return _currentView.getDomRangeFromRangeCfi(startCfi, endCfi, inclusive);
        }
        return undefined;
    };

    /**
     * Generate range CFI from DOM range
     * @param {DOM Range} https://developer.mozilla.org/en-US/docs/Web/API/Range
     * @returns {string} - represents Range CFI for the DOM range
     */
    this.getRangeCfiFromDomRange = function(domRange) {
        if (_currentView) {
            return _currentView.getRangeCfiFromDomRange(domRange);
        }
        return undefined;
    };

    /**
     * @param x
     * @param y
     * @param [precisePoint]
     * @param [spineItemIdref] Required for fixed layout views
     * @returns {string}
     */
    this.getVisibleCfiFromPoint = function (x, y, precisePoint, spineItemIdref) {
        if (_currentView) {
            return _currentView.getVisibleCfiFromPoint(x, y, precisePoint, spineItemIdref);
        }
        return undefined;
    };

    /**
     *
     * @param startX
     * @param startY
     * @param endX
     * @param endY
     * @param [spineItemIdref] Required for fixed layout views
     * @returns {*}
     */
    this.getRangeCfiFromPoints = function(startX, startY, endX, endY, spineItemIdref) {
        if (_currentView) {
            return _currentView.getRangeCfiFromPoints(startX, startY, endX, endY, spineItemIdref);
        }
        return undefined;
    };

    /**
     *
     * @param {HTMLElement} element
     * @returns {*}
     */
    this.getCfiForElement = function(element) {
        if (_currentView) {
            return _currentView.getCfiForElement(element);
        }
        return undefined;
    };

    /**
     *
     * @param x
     * @param y
     * @param [spineItemIdref] Required for fixed layout views
     * @returns {*}
     */
    this.getImageDataFromPoint = function (x, y, spineItemIdref) {
        if (_currentView) {
            var element = _currentView.getElementFromPoint(x, y, spineItemIdref);
            if (element.tagName.toLowerCase() === "img") {
                var cfi = _currentView.getCfiForElement(element);
                var rect = element.getBoundingClientRect();
                return {
                    location: cfi,
                    pathToLocation: $(element).data('rd-src') || $(element).attr('src'),
                    topLeftX: Math.ceil(rect.left),
                    topLeftY: Math.ceil(rect.top),
                    bottomRightX: Math.ceil(rect.right),
                    bottomRightY: Math.ceil(rect.bottom)
                };
            } else {
                return null;
            }
        }
        return undefined;
    };
};

/**
 * View Type
 * @typedef {object} ReadiumSDK.Views.ReaderView.ViewType
 * @property {number} VIEW_TYPE_COLUMNIZED          Reflowable document view
 * @property {number} VIEW_TYPE_FIXED               Fixed layout document view
 * @property {number} VIEW_TYPE_SCROLLED_DOC        Scrollable document view
 * @property {number} VIEW_TYPE_SCROLLED_CONTINUOUS Continuous scrollable document view
 */
ReadiumSDK.Views.ReaderView.VIEW_TYPE_COLUMNIZED = 1;
ReadiumSDK.Views.ReaderView.VIEW_TYPE_FIXED = 2;
ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_DOC = 3;
ReadiumSDK.Views.ReaderView.VIEW_TYPE_SCROLLED_CONTINUOUS = 4;
