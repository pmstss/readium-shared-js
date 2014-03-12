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

            _.each(eventListeners, function(value, key){
                for (var i = 0, count = value.length; i < count; i++) {
                    var options = value[i].options;
                    var event = key;
                    var callback = value[i].callback;
                    var context = value[i].context;

                    function addJqueryEvent(obj) {
                        obj.on(event, callback, context);
                    }

                    function addNativeEvent(obj) {
                        obj.addEventListener(event, callback, context);
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
                }
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
            callback.call(context, true);
            $(iframe).show();
        };

        iframe.src = src;
    };
};
