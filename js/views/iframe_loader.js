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

ReadiumSDK.Views.IFrameLoader = function () {

    var eventListeners = {};

    this.addIFrameEventListener = function (eventName, callback, context, jqueryEvent) {

        if (eventListeners[eventName] == undefined) {
            eventListeners[eventName] = [];
        }

        eventListeners[eventName].push({callback: callback, context: context, jqueryEvent: jqueryEvent});
    };

    this.loadIframe = function (iframe, src, callback, context) {

        $(iframe).hide();

        iframe.onload = function () {

            _.each(eventListeners, function (value, key) {
                for (var i = 0, count = value.length; i < count; i++) {
                    if (value[i].jqueryEvent) {
                        $(iframe.contentDocument.body).on(key, value[i].callback, value[i].context);
                    } else {
                        iframe.contentWindow.addEventListener(key, value[i].callback, value[i].context);
                    }
                }
            });

            try {
                iframe.contentWindow.navigator.epubReadingSystem = navigator.epubReadingSystem;
                console.debug("epubReadingSystem name:"
                    + iframe.contentWindow.navigator.epubReadingSystem.name
                    + " version:"
                    + iframe.contentWindow.navigator.epubReadingSystem.version
                    + " is loaded to iframe");
            }
            catch (ex) {
                console.log("epubReadingSystem INJECTION ERROR! " + ex.message);
            }
            callback.call(context, true);
            $(iframe).show();
        };

        injectScripts(src, function (dom) {
            iframe.contentWindow.document.open();
            iframe.contentWindow.document.write(dom.firstChild.outerHTML);
            iframe.contentWindow.document.close();
        });
    };

    function getFileText(path, callback) {

        $.ajax({
            url: path,
            dataType: 'xml',
            async: true,
            success: function (result) {
                callback(result);
            },
            error: function (xhr, status, errorThrown) {
                console.error('Error when AJAX fetching ' + path);
                console.error(status);
                console.error(errorThrown);
                callback();
            }
        });
    }

    function injectScripts(src, callback) {

        getFileText(src, function (contentFileData) {

            if (!contentFileData) {
                callback();
                return;
            }

            var $head = $('head', contentFileData);
            var $base = $('base', $head);

            if ($base.length === 0) {
                var sourceParts = src.split("/");
                sourceParts.pop(); //remove source file name
                $base = $("<base href=\"" + sourceParts.join("/") + "/" + "\">");
                $head.prepend($base);
            }

            var securityScript = "<script>(" + disableParent.toString() + ")()<\/script>";
            $('body', contentFileData).prepend(securityScript);

//            var readingSystemScript = createSetReadingSystemObjectString(navigator.epubReadingSystem);
//            $('body', contentFileData).append("<script>(" + readingSystemScript + ")()<\/script>");

            callback(contentFileData);
        });
    }

    function disableParent() {
        window.parent = undefined;
    }
};