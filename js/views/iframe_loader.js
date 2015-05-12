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


/**
 *
 * @constructor
 */
ReadiumSDK.Views.IFrameLoader = function() {

    var self = this;
    var eventListeners = {};


    this.addIFrameEventListener = function(eventName, callback, context, options) {

        if (eventListeners[eventName] == undefined) {
            eventListeners[eventName] = [];
        }

        eventListeners[eventName].push({callback: callback, context: context, options: options});
    };

    this.updateIframeEvents = function (iframe) {

        _.each(eventListeners, function(eventHandlerList, eventName){
            _.each(eventHandlerList,function(eventHandler){
                var options = eventHandler.options;
                var callback = eventHandler.callback;
                var context = eventHandler.context;

                function addJqueryEvent(obj) {
                    obj.on(eventName, callback, context);
                }

                function addNativeEvent(obj) {
                    obj.addEventListener(eventName, callback, context);
                }

                if (!iframe.contentWindow) {
                    return;
                }

                if (!options) {
                    addNativeEvent(iframe.contentWindow);
                } else {
                    if (options.onWindow) {
                        if (options.jqueryEvent) {
                            addJqueryEvent($(iframe.contentWindow));
                        } else {
                            addNativeEvent(iframe.contentWindow);
                        }
                    } else if (options.onDocument) {
                        if (options.jqueryEvent) {
                            addJqueryEvent($(iframe.contentDocument));
                        } else {
                            addNativeEvent(iframe.contentDocument);
                        }
                    } else if (options.onBody) {
                        if (options.jqueryEvent) {
                            addJqueryEvent($(iframe.contentDocument.body));
                        } else {
                            addNativeEvent(iframe.contentDocument.body);
                        }
                    } else if (options.onSelector) {
                        if (options.jqueryEvent) {
                            addJqueryEvent($(options.onSelector));
                        } else {
                            addNativeEvent($(options.onSelector)[0]);
                        }
                    }
                }
            });
        });
    };
    
    this.loadIframe = function (iframe, src, callback, context, attachedData) {

        iframe.setAttribute("data-baseUri", iframe.baseURI);
        iframe.setAttribute("data-src", src);

        $(iframe).hide();
        
        var loadedDocumentUri = new URI(src).absoluteTo(iframe.baseURI).toString();

        self._loadIframeWithUri(iframe, attachedData, loadedDocumentUri, function () {
            var doc = iframe.contentDocument || iframe.contentWindow.document;
            $('svg', doc).load(function(){
                console.log('loaded');
            });
            $(iframe).show();
            callback.call(context, true, attachedData);
        });
    };

    this._loadIframeWithUri = function (iframe, attachedData, contentUri, callback) {

        iframe.onload = function () {


            self.updateIframeEvents(iframe);

            var mathJax = iframe.contentWindow.MathJax;
            if (mathJax) {
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
        
        if (window.location.protocol
            && window.location.protocol === 'http:'
            || window.location.protocol === 'https:') {
            //replace location history instead of setting src attribute
            // because browsers like to create new history entries with the latter
            // (this prevents unexpected behaviour when hitting a browser's back button
            // but does not seem to work well with file:// protocols)
            if (iframe.contentWindow
                && iframe.contentWindow.location
                && iframe.contentWindow.location.replace
                && (typeof iframe.contentWindow.location.replace) === "function") {

                iframe.contentWindow.location.replace(contentUri);
            } else {
                iframe.setAttribute("src", contentUri);
            }
        } else {
            iframe.setAttribute("src", contentUri);
        }
        
    };

    

};
