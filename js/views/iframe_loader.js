//  LauncherOSX
//
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

// jshint quotmark:false
// jscs:disable validateQuoteMarks

define(["jquery", "underscore", "URIjs"], function ($, _, URI) {
'use strict';

return function () {

    var self = this;
    var windowEventListeners = {};
    var documentEventListeners = {};
    var debugMode = ReadiumSDK.DEBUG_MODE;
    var _iframe;

    function _removeListenerFrom(listeners, callback, useCapture) {
        if (listeners) {
            var matchIdx = -1;
            listeners.forEach(function (listener, idx) {
                if (listener.callback === callback && listener.useCapture === useCapture) {
                    matchIdx = idx;
                }
            });
            if (matchIdx !== -1) {
                listeners.splice(matchIdx, 1);
                return true;
            }
        }
        return false;
    }

    this.addIFrameWindowEventListener = function (eventName, callback, useCapture) {
        if (!windowEventListeners[eventName]) {
            windowEventListeners[eventName] = [];
        }

        windowEventListeners[eventName].push({
            callback: callback,
            useCapture: useCapture
        });
    };

    this.removeIFrameWindowEventListener = function (eventName, callback, useCapture) {
        _removeListenerFrom(windowEventListeners[eventName], callback, useCapture);
    };

    this.addIFrameDocumentEventListener = function (eventName, callback, useCapture) {
        if (!documentEventListeners[eventName]) {
            documentEventListeners[eventName] = [];
        }

        documentEventListeners[eventName].push({
            callback: callback,
            useCapture: useCapture
        });
    };

    this.removeIFrameDocumentEventListener = function (eventName, callback, useCapture) {
        _removeListenerFrom(documentEventListeners[eventName], callback, useCapture);
    };

    function _detachIFrameWindowListener(iframe, eventName, listener) {
        iframe.contentWindow.removeEventListener(eventName, listener.callback, listener.useCapture);
    }

    function _attachIFrameWindowListener(iframe, eventName, listener) {
        iframe.contentWindow.addEventListener(eventName, listener.callback, listener.useCapture);
    }

    function _detachIFrameDocumentListener(iframe, eventName, listener) {
        iframe.contentDocument.removeEventListener(eventName, listener.callback, listener.useCapture);
    }

    function _attachIFrameDocumentListener(iframe, eventName, listener) {
        iframe.contentDocument.addEventListener(eventName, listener.callback, listener.useCapture);
    }

    this.updateIframeEvents = function (iframeParam) {
        var iframe = iframeParam || _iframe;
        var eventName;
        for (eventName in windowEventListeners) {
            if (windowEventListeners.hasOwnProperty(eventName)) {
                windowEventListeners[eventName].forEach(_detachIFrameWindowListener.bind(null, iframe, eventName));
                windowEventListeners[eventName].forEach(_attachIFrameWindowListener.bind(null, iframe, eventName));
            }
        }

        for (eventName in documentEventListeners) {
            if (documentEventListeners.hasOwnProperty(eventName)) {
                documentEventListeners[eventName].forEach(_detachIFrameDocumentListener.bind(null, iframe, eventName));
                documentEventListeners[eventName].forEach(_attachIFrameDocumentListener.bind(null, iframe, eventName));
            }
        }
    };

    this.loadIframe = function (iframe, src, callback, context, attachedData) {
        if (!iframe.baseURI) {
            if (typeof location !== 'undefined') {
                iframe.baseURI = location.href + "";
            }
            console.error("!iframe.baseURI => " + iframe.baseURI);
        }

        if (debugMode) {
            console.log("EPUB doc iframe src: %o", src);
            console.log("EPUB doc iframe base URI: %o", iframe.baseURI);
        }

        iframe.setAttribute("data-baseUri", iframe.baseURI);
        iframe.setAttribute("data-src", src);

        var loadedDocumentUri = new URI(src).absoluteTo(iframe.baseURI).search('').hash('').toString();
        self._loadIframeWithUri(iframe, attachedData, loadedDocumentUri, function () {
            callback.call(context, true, attachedData);
        });
    };

    this._loadIframeWithUri = function (iframe, attachedData, contentUri, callback) {
        iframe.onload = this._onIframeLoad.bind(this, iframe, callback);
        iframe.setAttribute("src", contentUri);
    };

    this._onIframeLoad = function (iframe, callback) {
        _iframe = iframe;

        var doc = iframe.contentDocument || iframe.contentWindow.document;

        $('svg', doc).load(function () {
            console.log('SVG loaded');
        });

        self.updateIframeEvents(iframe);

        var mathJax = iframe.contentWindow.MathJax;
        if (mathJax) {
            if (debugMode) {
                console.log("MathJax VERSION: " + mathJax.cdnVersion + " // " + mathJax.fileversion + " // " + mathJax.version);
            }

            var useFontCache = true; // default in MathJax

            // Firefox fails to render SVG otherwise
            if (mathJax.Hub.Browser.isFirefox) {
                useFontCache = false;
            }

                // Chrome 49+ fails to render SVG otherwise
                // https://github.com/readium/readium-js/issues/138
                if (mathJax.Hub.Browser.isChrome) {
                    useFontCache = false;
                }
                
            // Edge fails to render SVG otherwise
            // https://github.com/readium/readium-js-viewer/issues/394#issuecomment-185382196
            if (window.navigator.userAgent.indexOf("Edge") > 0) {
                useFontCache = false;
            }

            mathJax.Hub.Config({
                showMathMenu: false,
                messageStyle: "none",
                showProcessingMessages: true,
                SVG: {
                    useFontCache: useFontCache
                }
            });

            // If MathJax is being used, delay the callback until it has completed rendering
            var mathJaxCallback = _.once(callback);
            try {
                mathJax.Hub.Queue(mathJaxCallback);
            } catch (err) {
                console.error("MathJax fail!");
                callback();
            }
            // Or at an 8 second timeout, which ever comes first
            //window.setTimeout(mathJaxCallback, 8000);
        } else {
            callback();
        }
    };
};
});
