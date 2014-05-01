//  LauncherOSX
//
//  Created by Boris Schneiderman.
// Modified by Daniel Weck
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

ReadiumSDK.Views.IFrameLoader = function() {

    var eventListeners = {};

    this.addIFrameEventListener = function(eventName, callback, context, options) {

        if(eventListeners[eventName] == undefined) {
            eventListeners[eventName] = [];
        }

        eventListeners[eventName].push({callback: callback, context: context, options: options});
    };

    this.loadIframe = function(iframe, src, callback, context) {

        $(iframe).hide();

        iframe.onload = function() {

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

            try
            {
                iframe.contentWindow.navigator.epubReadingSystem = navigator.epubReadingSystem;
                console.debug("epubReadingSystem name:"
                    + iframe.contentWindow.navigator.epubReadingSystem.name
                    + " version:"
                    + iframe.contentWindow.navigator.epubReadingSystem.version
                    + " is loaded to iframe");
            }
            catch(ex)
            {
                console.log("epubReadingSystem INJECTION ERROR! " + ex.message);
            }
            $(iframe).show();
            callback.call(context, true);
        };

        iframe.src = src;
    };
};
