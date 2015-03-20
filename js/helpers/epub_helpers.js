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
 * @param contentRef
 * @param sourceFileHref
 * @returns {string}
 * @constructor
 */
ReadiumSDK.Helpers.ResolveContentRef = function(contentRef, sourceFileHref) {

    if(!sourceFileHref) {
        return contentRef;
    }

    var sourceParts = sourceFileHref.split("/");
    sourceParts.pop(); //remove source file name

    var pathComponents = contentRef.split("/");

    while(sourceParts.length  > 0 && pathComponents[0] === "..") {

        sourceParts.pop();
        pathComponents.splice(0, 1);
    }

    var combined = sourceParts.concat(pathComponents);

    return combined.join("/");

};



/**
 *
 * @param $viewport
 * @param spineItem
 * @param settings
 * @returns {boolean}
 */
//Based on https://docs.google.com/spreadsheet/ccc?key=0AoPMUkQhc4wcdDI0anFvWm96N0xRT184ZE96MXFRdFE&usp=drive_web#gid=0 doc
// Returns falsy and truthy
// true and false mean that the synthetic-spread or single-page is "forced" (to be respected whatever the external conditions)
// 1 and 0 mean that the synthetic-spread or single-page is "not forced" (is allowed to be overriden by external conditions, such as optimum column width / text line number of characters, etc.)
ReadiumSDK.Helpers.deduceSyntheticSpread = function($viewport, spineItem, settings) {

    if(!$viewport || $viewport.length == 0) {
        return 0; // non-forced
    }

    //http://www.idpf.org/epub/fxl/#property-spread-values

    var rendition_spread = spineItem ? spineItem.getRenditionSpread() : undefined;

    if(rendition_spread === ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_NONE) {
        return false; // forced

        //"Reading Systems must not incorporate this spine item in a synthetic spread."
    }

    if(settings.syntheticSpread == "double") {
        return true; // forced
    }
    else if(settings.syntheticSpread == "single") {
        return false; // forced
    }

    if(!spineItem) {
        return 0; // non-forced
    }

    if(rendition_spread === ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_BOTH) {
        return true; // forced

        //"Reading Systems should incorporate this spine item in a synthetic spread regardless of device orientation."
    }

    var orientation = ReadiumSDK.Helpers.getOrientation($viewport);

    if(rendition_spread === ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_LANDSCAPE) {
        return orientation === ReadiumSDK.Views.ORIENTATION_LANDSCAPE; // forced

        //"Reading Systems should incorporate this spine item in a synthetic spread only when the device is in landscape orientation."
    }

    if(rendition_spread === ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_PORTRAIT) {
        return orientation === ReadiumSDK.Views.ORIENTATION_PORTRAIT; // forced

        //"Reading Systems should incorporate this spine item in a synthetic spread only when the device is in portrait orientation."
    }

    if(!rendition_spread || rendition_spread === ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_AUTO) {
        // if no spread set in document and user didn't set in in setting we will do double for landscape
        var landscape = orientation === ReadiumSDK.Views.ORIENTATION_LANDSCAPE;
        return landscape ? 1 : 0; // non-forced

        //"Reading Systems may use synthetic spreads in specific or all device orientations as part of a display area utilization optimization process."
    }

    console.warn("ReadiumSDK.Helpers.deduceSyntheticSpread: spread properties?!");
    return 0; // non-forced
};


/**
 *
 * @param item
 * @param orientation
 * @returns {boolean}
 */
ReadiumSDK.Helpers.isRenditionSpreadPermittedForItem = function(item, orientation) {

    var rendition_spread = item.getRenditionSpread();

    return  !rendition_spread
        ||  rendition_spread == ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_BOTH
        ||  rendition_spread == ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_AUTO
        ||  (rendition_spread == ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_LANDSCAPE
        && orientation == ReadiumSDK.Views.ORIENTATION_LANDSCAPE)
        ||  (rendition_spread == ReadiumSDK.Models.SpineItem.RENDITION_SPREAD_PORTRAIT
        && orientation == ReadiumSDK.Views.ORIENTATION_PORTRAIT );
};