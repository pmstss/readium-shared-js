//  LauncherOSX
//
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




/**
 *
 * @param str
 * @param suffix
 * @returns {boolean}
 * @static
 */
ReadiumSDK.Helpers.EndsWith = function (str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

/**
 *
 * @param str
 * @param suffix
 * @returns {boolean}
 * @static
 */
ReadiumSDK.Helpers.BeginsWith = function (str, suffix) {

    return str.indexOf(suffix) === 0;
};

/**
 *
 * @param str
 * @param toRemove
 * @returns {string}
 * @static
 */
ReadiumSDK.Helpers.RemoveFromString = function(str, toRemove) {

    var startIx = str.indexOf(toRemove);

    if(startIx == -1) {
        return str;
    }

    return str.substring(0, startIx) + str.substring(startIx + toRemove.length);
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

ReadiumSDK.Helpers.CSSTransition = function($el, trans) {
    
    // does not work!
    //$el.css('transition', trans);
    
    var css={};
    // empty '' prefix FIRST!
    _.each(['', '-webkit-', '-moz-', '-ms-'], function(prefix) {
        css[prefix + 'transition'] = prefix + trans;
    });
    $el.css(css);
}

//scale, left, top, angle, origin
ReadiumSDK.Helpers.CSSTransformString = function(options) {
    var enable3D = options.enable3D ? true : false;
    
    var translate, scale, rotation,
        origin = options.origin;

    if (options.left || options.top){
        var left = options.left || 0, 
            top = options.top || 0;

        translate = enable3D ? ("translate3D(" + left + "px, " + top + "px, 0)") : ("translate(" + left + "px, " + top + "px)");
    }
    if (options.scale){
        scale = enable3D ? ("scale3D(" + options.scale + ", " + options.scale + ", 0)") : ("scale(" + options.scale + ")");
    }
    if (options.angle){
        rotation =  enable3D ? ("rotate3D(0,0," + options.angle + "deg)") : ("rotate(" + options.angle + "deg)");
    }
    
    if (!(translate || scale || rotation)){
        return {};
    }

    var transformString = (translate && scale) ? (translate + " " + scale) : (translate ? translate : scale); // the order is important!
    if (rotation)
    {
        transformString = transformString + " " + rotation;
        //transformString = rotation + " " + transformString;
    }

    var css = {};
    css['transform'] = transformString;
    css['transform-origin'] = origin ? origin : (enable3D ? '0 0 0' : '0 0');
    return css;
};

ReadiumSDK.Helpers.extendedThrottle = function (startCb, tickCb, endCb, tickRate, waitThreshold, context) {
    if (!tickRate) tickRate = 250;
    if (!waitThreshold) waitThreshold = tickRate;

    var first = true,
        last,
        deferTimer;

    return function () {
        var ctx = context || this,
            now = (Date.now && Date.now()) || new Date().getTime(),
            args = arguments;

        if (!(last && now < last + tickRate)) {
            last = now;
            if (first) {
                startCb.apply(ctx, args);
                first = false;
            } else {
                tickCb.apply(ctx, args);
            }
        }

        clearTimeout(deferTimer);
        deferTimer = setTimeout(function () {
            last = now;
            first = true;
            endCb.apply(ctx, args);
        }, waitThreshold);
    };
};


//TODO: consider using CSSOM escape() or polyfill
//https://github.com/mathiasbynens/CSS.escape/blob/master/css.escape.js
//http://mathiasbynens.be/notes/css-escapes
/**
 *
 * @param sel
 * @returns {string}
 */
ReadiumSDK.Helpers.escapeJQuerySelector = function(sel) {
        //http://api.jquery.com/category/selectors/
        //!"#$%&'()*+,./:;<=>?@[\]^`{|}~
        // double backslash escape
        
        if (!sel) return undefined;
        
        var selector = sel.replace(/([;&,\.\+\*\~\?':"\!\^#$%@\[\]\(\)<=>\|\/\\{}`])/g, '\\$1');
        
        // if (selector !== sel)
        // {
        //     console.debug("---- SELECTOR ESCAPED");
        //     console.debug("1: " + sel);
        //     console.debug("2: " + selector);
        // }
        // else
        // {
        //     console.debug("---- SELECTOR OKAY: " + sel);
        // }
        
        return selector;
};
    // TESTS BELOW ALL WORKING FINE :)
    // (RegExp typos are hard to spot!)
    // escapeSelector('!');
    // escapeSelector('"');
    // escapeSelector('#');
    // escapeSelector('$');
    // escapeSelector('%');
    // escapeSelector('&');
    // escapeSelector("'");
    // escapeSelector('(');
    // escapeSelector(')');
    // escapeSelector('*');
    // escapeSelector('+');
    // escapeSelector(',');
    // escapeSelector('.');
    // escapeSelector('/');
    // escapeSelector(':');
    // escapeSelector(';');
    // escapeSelector('<');
    // escapeSelector('=');
    // escapeSelector('>');
    // escapeSelector('?');
    // escapeSelector('@');
    // escapeSelector('[');
    // escapeSelector('\\');
    // escapeSelector(']');
    // escapeSelector('^');
    // escapeSelector('`');
    // escapeSelector('{');
    // escapeSelector('|');
    // escapeSelector('}');
    // escapeSelector('~');
