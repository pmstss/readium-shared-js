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
 * CFI navigation helper class
 *
 * @param options Additional settings for NavigationLogic object
 *      - paginationInfo            Layout details, used by clientRect-based geometry
 *      - visibleContentOffsets     Function that returns offsets. If supplied it is used instead of the inferred offsets
 *      - frameDimensions           Function that returns an object with width and height properties. Needs to be set.
 *      - $iframe                   Iframe reference, and needs to be set.
 * @constructor
 */

// jscs:disable disallowMultipleVarDecl
// jscs:disable validateQuoteMarks
// jshint quotmark:false
// jshint latedef: nofunc

define(["jquery", "underscore", "js-cache-lru", "../helpers", 'readium_cfi_js'], function ($, _, LRUCache, Helpers, EPUBcfi) {

'use strict';

return function (options) {

    var self = this;
    options = options || {};

    var DEBUG = false; // relates to getVisibleTextRangeOffsetsSelectedByFunc
    var debugMode = ReadiumSDK.DEBUG_MODE;  // generic console logging
    var cfiDebug = true;   // enables first/last/secondSpreadFirst cfi highlighting, timings for getVisibleLeafNodes

    // ### tss: replacing trivial cache with LRU implementation with capacity and maxAge support
    // this caches will be recreated on spine change
    var _cacheEnabled = true;
    var _cacheVisibleLeafNodes = new LRUCache(50, 60 * 60 * 1000);
    var _cacheVisibleLeafCfi = new LRUCache(200, 60 * 60 * 1000);

    this.getRootElement = function () {
        var rootDoc = this.getRootDocument();
        return rootDoc && rootDoc.documentElement;
    };

    this.getBodyElement = function () {
        // In SVG documents the root element can be considered the body.
        var rootDoc = this.getRootDocument();
        return rootDoc && rootDoc.body || this.getRootElement();
    };

    this.getRootDocument = function () {
        return options.$iframe[0].contentDocument;
    };

    function createRange() {
        return self.getRootDocument().createRange();
    }

    function getNodeClientRect(node, visibleContentOffsets) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            return normalizeRectangle(node.getBoundingClientRect(), visibleContentOffsets);
        } else {
            var range = createRange();
            range.selectNode(node);
            return normalizeRectangle(range.getBoundingClientRect(), visibleContentOffsets);
        }
    }

    // IE does not return correct client rectangles for single image node, so
    // if this image node is single child - then returning parent node instead
    function getNodeForSelectionIEWorkaround(node) {
        var parent = node.parentNode;
        return node.nodeType === Node.ELEMENT_NODE && node.tagName.toUpperCase() === 'IMG' && parent.childNodes.length === 1 ?
                parent : node;
    }

    function getNodeContentsClientRect(node, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        var range = createRange();
        range.selectNodeContents(getNodeForSelectionIEWorkaround(node));
        return normalizeRectangle(range.getBoundingClientRect(), visibleContentOffsets);
    }

    function getNodeRangeClientRect(startNode, startOffset, endNode, endOffset) {
        var range = createRange();
        range.setStart(startNode, startOffset ? startOffset : 0);
        if (endNode.nodeType === Node.ELEMENT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : endNode.childNodes.length);
        } else if (endNode.nodeType === Node.TEXT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : 0);
        }
        return normalizeRectangle(range.getBoundingClientRect(), getVisibleContentOffsets());
    }

    function getNodeClientRectList(node, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();

        var range = createRange();
        range.selectNode(getNodeForSelectionIEWorkaround(node));
        return _.map(range.getClientRects(), function (rect) {
            return normalizeRectangle(rect, visibleContentOffsets);
        });
    }

    function getFrameDimensions() {
        if (options.frameDimensions) {
            return options.frameDimensions();
        }

        console.error('CfiNavigationLogic: No frame dimensions specified!');
        return null;
    }

    this.getFrameDimensions = getFrameDimensions;

    function getCaretRangeFromPoint(x, y, document) {
        document = document || self.getRootDocument();
        Helpers.polyfillCaretRangeFromPoint(document); //only polyfills once, no-op afterwards
        //### tss: hiding highlights to prevent their selection by caretRangeFromPoint
        var $highlights = $('.rd-highlight', document);
        $highlights.hide();
        var res = document.caretRangeFromPoint(x, y);
        $highlights.show();
        return res;
    }

    function isPaginatedView() {
        return !!options.paginationInfo;
    }

    /**
     * @private
     * Checks whether or not pages are rendered right-to-left
     *
     * @returns {boolean}
     */
    function isPageProgressionRightToLeft() {
        return options.paginationInfo && !!options.paginationInfo.rightToLeft;
    }

    /**
     * @private
     * Checks whether or not pages are rendered with vertical writing mode
     *
     * @returns {boolean}
     */
    function isVerticalWritingMode() {
        return options.paginationInfo && !!options.paginationInfo.isVerticalWritingMode;
    }

    /**
     * @private
     * Checks whether or not a (fully adjusted) rectangle is at least partly visible
     *
     * @param {Object} rect
     * @param {boolean} ignorePartiallyVisible
     * @param {Object} [frameDimensions]
     * @returns {boolean}
     */
    function isRectVisible(rect, ignorePartiallyVisible, frameDimensions) {
        frameDimensions = frameDimensions || getFrameDimensions();

        //Text nodes without printable text don't have client rectangles
        if (!rect) {
            return false;
        }
        //Sometimes we get client rects that are "empty" and aren't supposed to be visible
        if (rect.left === 0 && rect.right === 0 && rect.top === 0 && rect.bottom === 0) {
            return false;
        }

        if (isPaginatedView()) {
            return rect.left >= 0 && rect.left < frameDimensions.width ||
                !ignorePartiallyVisible && rect.left < 0 && rect.right >= 0;
        } else {
            return rect.top >= 0 && rect.top < frameDimensions.height ||
                !ignorePartiallyVisible && rect.top < 0 && rect.bottom >= 0;
        }

    }

    /**
     * @private
     * Retrieves _current_ full width of a column (including its gap)
     *
     * @returns {number} Full width of a column in pixels
     */
    function getColumnFullWidth() {
        if (!options.paginationInfo || isVerticalWritingMode()) {
            return options.$iframe.width();
        }

        return options.paginationInfo.columnWidth + options.paginationInfo.columnGap;
    }

    /**
     * @private
     *
     * Retrieves _current_ offset of a viewport
     * (related to the beginning of the chapter)
     *
     * @returns {Object}
     */
    function getVisibleContentOffsets() {
        if (options.visibleContentOffsets) {
            return options.visibleContentOffsets();
        }

        if (isVerticalWritingMode()) {
            return {
                top: options.paginationInfo ? options.paginationInfo.pageOffset : 0,
                left: 0
            };
        }

        if (isPaginatedView()) {
            return {
                top: 0,
                left: 0
            };
        } else {
            return {
                top: -$viewport.parent().scrollTop(),
                left: 0
            };
        }
    }

    this.getVisibleContentOffsets = getVisibleContentOffsets;

    // ### tss: new method used for shouldCalculateVisibilityPercentage calculations
    function _getRectanglesIntersection(a, b) {
        var x = Math.max(a.x, b.x);
        var num1 = Math.min(a.x + a.w, b.x + b.w);
        var y = Math.max(a.y, b.y);
        var num2 = Math.min(a.y + a.h, b.y + b.h);
        return num1 >= x && num2 >= y && {x: x, y: y, w: num1 - x, h: num2 - y};
    }

    /**
     * New (rectangle-based) algorithm, useful in multi-column layouts
     *
     * Note: the second param (props) is ignored intentionally
     * (no need to use those in normalization)
     *
     * @param {Node} element or jquery
     * @param {boolean} shouldCalculateVisibilityPercentage
     * @param {Object} visibleContentOffsets
     * @param {Object} [frameDimensions]
     * @returns {number|null}
     *      0 for non-visible elements,
     *      0 < n <= 100 for visible elements
     *      (will just give 100, if `shouldCalculateVisibilityPercentage` => false)
     *      null for elements with display:none
     */
    function checkVisibilityByRectangles(element, shouldCalculateVisibilityPercentage, visibleContentOffsets, frameDimensions) {
        element = element instanceof $ ? element[0] : element;

        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        var elementRectangles = getNormalizedRectangles(element, visibleContentOffsets);

        var clientRectangles = elementRectangles.clientRectangles;
        if (clientRectangles.length === 0) { // elements with display:none, etc.
            return null;
        }

        var visibilityPercentage = 0;

        if (clientRectangles.length === 1) {
            var adjustedRect = clientRectangles[0];

            if (isPaginatedView()) {
                if (adjustedRect.bottom > frameDimensions.height || adjustedRect.top < 0) {
                    // because of webkit inconsistency, that single rectangle should be adjusted
                    // until it hits the end OR will be based on the FIRST column that is visible
                    adjustRectangle(adjustedRect, true, frameDimensions);
                }
            }

            if (isRectVisible(adjustedRect, false, frameDimensions)) {
                // ### tss: shouldCalculateVisibilityPercentage fix based on new getRectanglesIntersection
                //it might still be partially visible in webkit
                if (shouldCalculateVisibilityPercentage/* && adjustedRect.top < 0*/) {
                    /*visibilityPercentage =
                        Math.floor(100 * (adjustedRect.height + adjustedRect.top) / adjustedRect.height);*/

                    var intersection = _getRectanglesIntersection({
                        x: 0,
                        y: 0,
                        w: frameDimensions.width,
                        h: frameDimensions.height
                    }, {
                        x: adjustedRect.left,
                        y: adjustedRect.top,
                        w: adjustedRect.width,
                        h: adjustedRect.height
                    });
                    if (intersection === false) {
                        console.error('invalid visibility calculations - no intersection for visible rectangle');
                        visibilityPercentage = 0;
                    } else {
                        visibilityPercentage = Math.min(100, Math.ceil(100 * (intersection.w / adjustedRect.width) *
                                (intersection.h / adjustedRect.height)));
                    }
                } else {
                    visibilityPercentage = 100;
                }
            }
        } else {
            // for an element split between several CSS columns,z
            // both Firefox and IE produce as many client rectangles;
            // each of those should be checked
            var visibleCounter = 0;
            for (var i = 0, l = clientRectangles.length; i < l; ++i) {
                if (isRectVisible(clientRectangles[i], false, frameDimensions)) {
                    //TODO ### improve accuracy; for now - raw calculation based on number of visible rectangles
                    /*visibilityPercentage = shouldCalculateVisibilityPercentage
                        ? measureVisibilityPercentageByRectangles(clientRectangles, i)
                        : 100;
                     break;*/
                    ++visibleCounter;
                }

                visibilityPercentage = Math.ceil(100 * visibleCounter / clientRectangles.length);
            }
        }

        return visibilityPercentage;
    }

    /**
     * Finds a page index (0-based) for a specific element.
     * Calculations are based on rectangles retrieved with getClientRects() method.
     *
     * @param {jQuery} $element
     * @param {number} spatialVerticalOffset
     * @returns {number|null}
     */
    function findPageByRectangles($element, spatialVerticalOffset) {
        var visibleContentOffsets = getVisibleContentOffsets();
        var elementRectangles = getNormalizedRectangles($element[0], visibleContentOffsets);

        var clientRectangles  = elementRectangles.clientRectangles;
        if (clientRectangles.length === 0) { // elements with display:none, etc.
            return null;
        }

        return calculatePageIndexByRectangles(clientRectangles, spatialVerticalOffset);
    }

    /**
     * @private
     * Calculate a page index (0-based) for given client rectangles.
     *
     * @param {object} clientRectangles
     * @param {number} [spatialVerticalOffset]
     * @param {object} [frameDimensions]
     * @param {object} [columnFullWidth]
     * @returns {number|null}
     */
    function calculatePageIndexByRectangles(clientRectangles, spatialVerticalOffset, frameDimensions, columnFullWidth) {
        var isRtl = isPageProgressionRightToLeft();
        var isVwm = isVerticalWritingMode();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        frameDimensions = frameDimensions || getFrameDimensions();

        if (spatialVerticalOffset) {
            trimRectanglesByVertOffset(clientRectangles, spatialVerticalOffset,
                frameDimensions, columnFullWidth, isRtl, isVwm);
        }

        var firstRectangle = _.first(clientRectangles);
        if (clientRectangles.length === 1) {
            adjustRectangle(firstRectangle, false, frameDimensions, columnFullWidth, isRtl, isVwm);
        }

        var pageIndex;

        if (isVwm) {
            var topOffset = firstRectangle.top;
            pageIndex = Math.floor(topOffset / frameDimensions.height);
        } else {
            var leftOffset = firstRectangle.left;
            if (isRtl) {
                leftOffset = columnFullWidth * (options.paginationInfo ? options.paginationInfo.visibleColumnCount : 1) - leftOffset;
            }
            pageIndex = Math.floor(leftOffset / columnFullWidth);
        }

        if (pageIndex < 0) {
            pageIndex = 0;
        } else if (pageIndex >= (options.paginationInfo ? options.paginationInfo.columnCount : 1)) {
            pageIndex = options.paginationInfo ? options.paginationInfo.columnCount - 1 : 0;
        }

        return pageIndex;
    }

    /**
     * Finds a page index (0-based) for a specific client rectangle.
     * Calculations are based on viewport dimensions, offsets, and rectangle coordinates
     *
     * @param {ClientRect} clientRectangle
     * @param {Object} [visibleContentOffsets]
     * @param {Object} [frameDimensions]
     * @returns {number|null}
     */
    function findPageBySingleRectangle(clientRectangle, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        var normalizedRectangle = normalizeRectangle(clientRectangle, visibleContentOffsets);

        return calculatePageIndexByRectangles([normalizedRectangle], frameDimensions);
    }

    /**
     * @private
     * Calculates the visibility offset percentage based on ClientRect dimensions
     *
     * @param {Array} clientRectangles (should already be normalized)
     * @param {number} firstVisibleRectIndex
     * @returns {number} - visibility percentage (0 < n <= 100)
     */
    /*function measureVisibilityPercentageByRectangles(clientRectangles, firstVisibleRectIndex) {
        var heightTotal = 0;
        var heightVisible = 0;

        if (clientRectangles.length > 1) {
            _.each(clientRectangles, function (rect, index) {
                heightTotal += rect.height;
                if (index >= firstVisibleRectIndex) {
                    // in this case, all the rectangles after the first visible
                    // should be counted as visible
                    heightVisible += rect.height;
                }
            });
        } else {
            // should already be normalized and adjusted
            heightTotal = clientRectangles[0].height;
            heightVisible = clientRectangles[0].height - Math.max(
                0, -clientRectangles[0].top);
        }

        // trivial case check, when element is 100% visible
        return heightVisible === heightTotal ? 100 : Math.floor(100 * heightVisible / heightTotal);
    }*/

    function serializeClientRect(clientRect) {
        return JSON.stringify({
            l: clientRect.left,
            t: clientRect.top,
            r: clientRect.right,
            b: clientRect.bottom
        });
    }

    /**
     * @private
     * Retrieves the position of $element in multi-column layout
     *
     * @param {Node} el
     * @param {Object} [visibleContentOffsets]
     * @returns {Object}
     */
    function getNormalizedRectangles(el, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || {};

        var boundingClientRect = getNodeClientRect(el, visibleContentOffsets);
        var cacheKey;
        if (_cacheEnabled) {
            var boundingClientRectStr = serializeClientRect(boundingClientRect);
            var visibleContentOffsetsStr = JSON.stringify(visibleContentOffsets);
            cacheKey = boundingClientRectStr + visibleContentOffsetsStr;
            if (el.cacheKey === cacheKey) {
                return el.cacheNormalizedRectangles;
            }
            delete el.cacheKey;
            delete el.cacheNormalizedRectangles;
        }

        // all the separate rectangles (for detecting position of the element split between several columns)
        var clientRectangles = [];
        var clientRectList = getNodeClientRectList(el, visibleContentOffsets);
        for (var i = 0, l = clientRectList.length; i < l; ++i) {
            // Firefox sometimes gets it wrong, adding literally empty (height = 0) client rectangle preceding the real one,
            // that empty client rectangle shouldn't be retrieved
            if (clientRectList[i].height > 0) {
                clientRectangles.push(clientRectList[i]);
            }
        }

        var res;
        //### tss: commented, because: 1) can't reproduce this in webkit; 2) has side-effects in IE
        /*if (clientRectangles.length === 0) {
            // sometimes an element is either hidden or empty, and that means
            // Webkit-based browsers fail to assign proper clientRects to it
            // in this case we need to go for its sibling (if it exists)
            var nextSibling = $(el).next()[0];
            if (nextSibling) {
                res = getNormalizedRectangles(nextSibling, visibleContentOffsets);
            }
        }

        if (!res) {*/
        res = {
            wrapperRectangle: boundingClientRect,
            clientRectangles: clientRectangles
        };
        /*}*/

        if (_cacheEnabled) {
            el.cacheKey = cacheKey;
            el.cacheNormalizedRectangles = res;
        }

        return res;
    }

    /**
     * @private
     * Converts TextRectangle object into a plain object,
     * taking content offsets (=scrolls, position shifts etc.) into account
     *
     * @param {Object} textRect
     * @param {Object} visibleContentOffsets
     * @returns {Object}
     */
    function normalizeRectangle(textRect, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        var plainRectObject = {
            left: textRect.left,
            right: textRect.right,
            top: textRect.top,
            bottom: textRect.bottom,
            width: textRect.right - textRect.left,
            height: textRect.bottom - textRect.top
        };

        // getClientRects()/getBoundaryClientRects() reports real width for elements with non-breakable spaces,
        // that could overflow column and affect calculations of visible elements
        if (plainRectObject.width > options.paginationInfo.columnWidth) {
            plainRectObject.width = options.paginationInfo.columnWidth;
            plainRectObject.right = plainRectObject.left + plainRectObject.width;
        }

        offsetRectangle(plainRectObject, visibleContentOffsets.left, visibleContentOffsets.top);
        return plainRectObject;
    }

    /**
     * @private
     * Offsets plain object (which represents a TextRectangle).
     *
     * @param {Object} rect
     * @param {number} leftOffset
     * @param {number} topOffset
     */
    function offsetRectangle(rect, leftOffset, topOffset) {
        rect.left += leftOffset;
        rect.right += leftOffset;
        rect.top += topOffset;
        rect.bottom += topOffset;
    }

    /**
     * @private
     *
     * When element is spilled over two or more columns,
     * most of the time Webkit-based browsers
     * still assign a single clientRectangle to it, setting its `top` property to negative value
     * (so it looks like it's rendered based on the second column)
     * Alas, sometimes they decide to continue the leftmost column - from _below_ its real height.
     * In this case, `bottom` property is actually greater than element's height and had to be adjusted accordingly.
     *
     * Ugh.
     *
     * @param {Object} rect
     * @param {boolean} [shouldLookForFirstVisibleColumn]
     *      If set, there'll be two-phase adjustment
     *      (to align a rectangle with a viewport)
     * @param {Object} [frameDimensions]
     * @param {number} [columnFullWidth]
     * @param {boolean} [isRtl]
     * @param {boolean} [isVwm]               isVerticalWritingMode
     */
    function adjustRectangle(rect, shouldLookForFirstVisibleColumn, frameDimensions, columnFullWidth, isRtl, isVwm) {
        frameDimensions = frameDimensions || getFrameDimensions();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        isRtl = isRtl || isPageProgressionRightToLeft();
        isVwm = isVwm || isVerticalWritingMode();

        // Rectangle adjustment is not needed in VWM since it does not deal with columns
        if (isVwm) {
            return;
        }

        if (isRtl) {
            columnFullWidth *= -1; // horizontal shifts are reverted in RTL mode
        }

        // first we go left/right (rebasing onto the very first column available)
        while (rect.top < 0) {
            offsetRectangle(rect, -columnFullWidth, frameDimensions.height);
        }

        // ... then, if necessary (for visibility offset checks),
        // each column is tried again (now in reverse order)
        // the loop will be stopped when the column is aligned with a viewport
        // (i.e., is the first visible one).
        if (shouldLookForFirstVisibleColumn) {
            while (rect.bottom >= frameDimensions.height) {
                if (isRectVisible(rect, false, frameDimensions, isVwm)) {
                    break;
                }
                offsetRectangle(rect, columnFullWidth, -frameDimensions.height);
            }
        }
    }

    /**
     * @private
     * Trims the rectangle(s) representing the given element.
     *
     * @param {Array} rects
     * @param {number} verticalOffset
     * @param {number} frameDimensions
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     * @param {boolean} isVwm               isVerticalWritingMode
     */
    function trimRectanglesByVertOffset(rects, verticalOffset, frameDimensions, columnFullWidth, isRtl, isVwm) {
        frameDimensions = frameDimensions || getFrameDimensions();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        isRtl = isRtl || isPageProgressionRightToLeft();
        isVwm = isVwm || isVerticalWritingMode();

        //TODO: Support vertical writing mode
        if (isVwm) {
            return;
        }

        var totalHeight = _.reduce(rects, function (prev, cur) {
            return prev + cur.height;
        }, 0);

        var heightToHide = totalHeight * verticalOffset / 100;
        if (rects.length > 1) {
            var heightAccum = 0;
            do {
                heightAccum += rects[0].height;
                if (heightAccum > heightToHide) {
                    break;
                }
                rects.shift();
            } while (rects.length > 1);
        } else {
            // rebase to the last possible column
            // (so that adding to top will be properly processed later)
            if (isRtl) {
                columnFullWidth *= -1;
            }
            while (rects[0].bottom >= frameDimensions.height) {
                offsetRectangle(rects[0], columnFullWidth, -frameDimensions.height);
            }

            rects[0].top += heightToHide;
            rects[0].height -= heightToHide;
        }
    }

    this.getCfiForElement = function (element) {
        var cfi = EPUBcfi.Generator.generateElementCFIComponent(element,
            ["cfi-marker"],
            [],
            ["MathJax_Message", "MathJax_SVG_Hidden"]);

        if (cfi[0] === "!") {
            cfi = cfi.substring(1);
        }
        return cfi;
    };

    //TODO ### tss: clarify usages
    this.getVisibleCfiFromPoint = function (x, y, precisePoint) {
        var document = self.getRootDocument();
        var firstVisibleCaretRange = getCaretRangeFromPoint(x, y, document);
        var elementFromPoint = document.elementFromPoint(x, y);
        var invalidElementFromPoint = !elementFromPoint || elementFromPoint === document.documentElement;

        if (precisePoint) {
            if (!elementFromPoint || invalidElementFromPoint) {
                return null;
            }
            var testRect = getNodeContentsClientRect(elementFromPoint);
            if (!isRectVisible(testRect, false)) {
                return null;
            }
            if (x < testRect.left || x > testRect.right || y < testRect.top || y > testRect.bottom) {
                return null;
            }
        }

        if (!firstVisibleCaretRange) {
            if (invalidElementFromPoint) {
                console.error("Could not generate CFI no visible element on page");
                return null;
            }
            firstVisibleCaretRange = createRange();
            firstVisibleCaretRange.selectNode(elementFromPoint);
        }

        var range = firstVisibleCaretRange;
        var cfi;
        //if we get a text node we need to get an approximate range for the first visible character offsets.
        var node = range.startContainer;
        var startOffset, endOffset;
        if (node.nodeType === Node.TEXT_NODE) {
            if (precisePoint && node.parentNode !== elementFromPoint) {
                return null;
            }
            if (node.length === 1 && range.startOffset === 1) {
                startOffset = 0;
                endOffset = 1;
            } else if (range.startOffset === node.length) {
                startOffset = range.startOffset - 1;
                endOffset = range.startOffset;
            } else {
                startOffset = range.startOffset;
                endOffset = range.startOffset + 1;
            }
            var wrappedRange = {
                startContainer: node,
                endContainer: node,
                startOffset: startOffset,
                endOffset: endOffset,
                commonAncestorContainer: range.commonAncestorContainer
            };

            if (debugMode) {
                drawDebugOverlayFromDomRange(wrappedRange);
            }

            cfi = generateCfiFromDomRange(wrappedRange);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            node =
                range.startContainer.childNodes[range.startOffset] ||
                range.startContainer.childNodes[0] ||
                range.startContainer;
            if (precisePoint && node !== elementFromPoint) {
                return null;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                cfi = generateCfiFromDomRange(range);
            } else {
                cfi = self.getCfiForElement(node);
            }
        } else {
            if (precisePoint && node !== elementFromPoint) {
                return null;
            }

            cfi = self.getCfiForElement(elementFromPoint);
        }

        //This should not happen but if it does print some output, just in case
        if (cfi && cfi.indexOf('NaN') !== -1) {
            console.error('Did not generate a valid CFI:' + cfi);
            return undefined;
        }

        return cfi;
    };

    this.getRangeCfiFromPoints = function (startX, startY, endX, endY) {
        var document = self.getRootDocument();
        var start = getCaretRangeFromPoint(startX, startY, document),
            end = getCaretRangeFromPoint(endX, endY, document),
            range = createRange();
        range.setStart(start.startContainer, start.startOffset);
        range.setEnd(end.startContainer, end.startOffset);
        // if we're looking at a text node create a nice range (n, n+1)
        if (start.startContainer === start.endContainer && start.startContainer.nodeType === Node.TEXT_NODE &&
                end.startContainer.length > end.startOffset + 1) {
            range.setEnd(end.startContainer, end.startOffset + 1);
        }
        return generateCfiFromDomRange(range);
    };

    function getTextNodeRectCornerPairs(rect) {
        //
        //    top left             top right
        //    ╲                   ╱
        //  ── ▒T▒E▒X▒T▒ ▒R▒E▒C▒T▒ ──
        //
        // top left corner & top right corner
        // but for y coord use the mid point between top and bottom

        if (isVerticalWritingMode()) {
            var x = rect.right - rect.width / 2;
            return [{x: x, y: rect.top}, {x: x, y: rect.bottom}];
        } else {
            var y = rect.top + rect.height / 2;
            var result = [{x: rect.left, y: y}, {x: rect.right, y: y}];
            return isPageProgressionRightToLeft() ? result.reverse() : result;
        }
    }

    function isCorrectCaretRange(caretRange, textNode) {
        return caretRange && (caretRange.startContainer === textNode  || caretRange.startContainer &&
            caretRange.startContainer.childNodes.length === 1 && caretRange.startContainer.childNodes[0] === textNode);
    }

    function applyCaretRangeIEWorkaround(caretRange, textNode, pickerFunc) {
        // Workaround for inconsistencies with the caretRangeFromPoint IE TextRange based shim.
        if (caretRange && caretRange.startContainer !== textNode && caretRange.startContainer === textNode.parentNode) {
            if (DEBUG) {
                console.log('ieTextRangeWorkaround needed');
            }
            var startOrEnd = pickerFunc([0, 1]);
            if (caretRange.startOffset === caretRange.endOffset) {
                var checkNode = caretRange.startContainer.childNodes[Math.max(caretRange.startOffset - 1, 0)];
                if (checkNode === textNode) {
                    caretRange = {
                        startContainer: textNode,
                        endContainer: textNode,
                        startOffset: startOrEnd === 0 ? 0 : textNode.nodeValue.length
                    };
                    if (DEBUG) {
                        console.log('ieTextRangeWorkaround #1:', caretRange);
                    }
                }
            } else if (DEBUG) { // Failed
                console.log('ieTextRangeWorkaround didn\'t work :(');
            }
        }
        return caretRange;
    }

    //### tss: caretRange check replaced with isCorrectCaretRange()
    function getVisibleTextRangeOffsetsSelectedByFunc(textNode, pickerFunc, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();

        var textNodeFragments = getNodeClientRectList(textNode, visibleContentOffsets);

        var visibleFragments = _.filter(textNodeFragments, function (rect) {
            return isRectVisible(rect, false, frameDimensions);
        });

        var fragment = pickerFunc(visibleFragments);
        if (!fragment) {
            //no visible fragment, empty text node?
            return null;
        }
        var fragmentCorner = pickerFunc(getTextNodeRectCornerPairs(fragment));
        // Reverse taking into account of visible content offsets
        fragmentCorner.x -= visibleContentOffsets.left;
        fragmentCorner.y -= visibleContentOffsets.top;

        // ### tss: adjusting
        if (pickerFunc === _.last) {
            fragmentCorner.x -= 1;
        } else {
            fragmentCorner.x += 1;
        }
        var caretRange = getCaretRangeFromPoint(fragmentCorner.x, fragmentCorner.y);
        if (Helpers.isIE()) {
            caretRange = applyCaretRangeIEWorkaround(caretRange, textNode, pickerFunc);
        }

        //TODO ###tss: hacky adjusting: for some reason IE returns few pixels larger than expected for range.getClientRects(),
        // and thus further getCaretRangeFromPoint() fails
        if (pickerFunc === _.last) {
            var tries = 0;
            var x = fragmentCorner.x;
            var origCaretRange = caretRange;
            while (++tries < 20 && !isCorrectCaretRange(caretRange, textNode)) {
                x -= 1;
                caretRange = applyCaretRangeIEWorkaround(getCaretRangeFromPoint(x, fragmentCorner.y), textNode, pickerFunc);
            }

            // restoring
            if (tries === 20) {
                caretRange = origCaretRange;
            }
        }

        if (DEBUG) {
            console.log('getVisibleTextRangeOffsetsSelectedByFunc: ', 'a0');
        }

        // Desperately try to find it from all angles! Darn sub pixeling..
        //TODO: remove the need for this brute-force method, since it's making the result non-deterministic
        // ### tss: condition checks beatifications
        /*if (!isCorrectCaretRange(caretRange, textNode)) {
            caretRange = getCaretRangeFromPoint(fragmentCorner.x - 1, fragmentCorner.y) ||
                getCaretRangeFromPoint(fragmentCorner.x, fragmentCorner.y - 1) ||
                getCaretRangeFromPoint(fragmentCorner.x - 1, fragmentCorner.y - 1);
            if (DEBUG) {
                console.log('getVisibleTextRangeOffsetsSelectedByFunc: ', 'a');
            }
        }

        if (!isCorrectCaretRange(caretRange, textNode)) {
            fragmentCorner.x = Math.floor(fragmentCorner.x);
            fragmentCorner.y = Math.floor(fragmentCorner.y);
            caretRange = getCaretRangeFromPoint(fragmentCorner.x, fragmentCorner.y) ||
                getCaretRangeFromPoint(fragmentCorner.x - 1, fragmentCorner.y) ||
                getCaretRangeFromPoint(fragmentCorner.x, fragmentCorner.y - 1) ||
                getCaretRangeFromPoint(fragmentCorner.x - 1, fragmentCorner.y - 1);
            if (DEBUG) {
                console.log('getVisibleTextRangeOffsetsSelectedByFunc: ', 'b');
            }
        }*/

        // Still nothing? fall through..
        if (!caretRange) {
            console.warn('getVisibleTextRangeOffsetsSelectedByFunc: no caret range result');
            return null;
        }

        if (!isCorrectCaretRange(caretRange, textNode)) {
            console.error('getVisibleTextRangeOffsetsSelectedByFunc: incorrect caret range result, caretRange.startContainer: %o',
                caretRange.startContainer);
        }

        return pickerFunc(
            [{start: caretRange.startOffset, end: caretRange.startOffset + 1},
            {start: caretRange.startOffset - 1, end: caretRange.startOffset}]
        );
    }

    function findVisibleLeafNodeCfi(leafNodeList, pickerFunc, targetLeafNode, visibleContentOffsets, frameDimensions, startingParent) {
        var index = 0;
        if (!targetLeafNode) {
            index = leafNodeList.indexOf(pickerFunc(leafNodeList));
            startingParent = leafNodeList[index].element;
        } else {
            index = leafNodeList.indexOf(targetLeafNode);
            if (index === -1) {
                //target leaf node not the right type? not in list?
                return null;
            }
            // use the next leaf node in the list
            index += pickerFunc([1, -1]);
        }
        var visibleLeafNode = leafNodeList[index];

        if (!visibleLeafNode) {
            return null;
        }

        var element = visibleLeafNode.element;
        var textNode = visibleLeafNode.textNode;

        if (targetLeafNode && element !== startingParent && !_.contains($(textNode || element).parents(), startingParent)) {
            if (DEBUG) {
                console.warn("findVisibleLeafNodeCfi: stopped recursion early");
            }
            return null;
        }

        //if a valid text node is found, try to generate a CFI with range offsets
        if (textNode && isValidTextNode(textNode)) {
            var visibleRange = getVisibleTextRangeOffsetsSelectedByFunc(textNode, pickerFunc, visibleContentOffsets, frameDimensions);
            if (!visibleRange) {
                //the text node is valid, but not visible..
                //let's try again with the next node in the list
                return findVisibleLeafNodeCfi(leafNodeList, pickerFunc, visibleLeafNode,
                        visibleContentOffsets, frameDimensions, startingParent);
            }
            var range = createRange();
            range.setStart(textNode, visibleRange.start);
            range.setEnd(textNode, visibleRange.end);
            return generateCfiFromDomRange(range);
        } else {
            //if not then generate a CFI for the element
            return self.getCfiForElement(element);
        }
    }

    // get an array of visible text elements and then select one based on the func supplied
    // and generate a CFI for the first visible text subrange.
    function getVisibleTextRangeCfiForTextElementSelectedByFunc(pickerFunc, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        var cacheKey;
        if (_cacheEnabled) {
            cacheKey = _getVisibleLeafNodesCacheKey(options.paginationInfo, visibleContentOffsets, frameDimensions, pickerFunc);
            var fromCache = _cacheVisibleLeafCfi.get(cacheKey);
            if (fromCache) {
                return fromCache;
            }
        }

        var visibleLeafNodeList = self.getVisibleLeafNodes(visibleContentOffsets, frameDimensions, pickerFunc);
        if (!visibleLeafNodeList || visibleLeafNodeList.length === 0) {
            return null;
        }
        var nodeCfi = findVisibleLeafNodeCfi(visibleLeafNodeList, pickerFunc, null, visibleContentOffsets, frameDimensions);

        if (_cacheEnabled) {
            _cacheVisibleLeafCfi.set(cacheKey, nodeCfi);
        }

        return nodeCfi;
    }

    function getLastVisibleTextRangeCfi(visibleContentOffsets, frameDimensions) {
        return getVisibleTextRangeCfiForTextElementSelectedByFunc(_.last, visibleContentOffsets, frameDimensions);
    }

    function getFirstVisibleTextRangeCfi(visibleContentOffsets, frameDimensions) {
        return getVisibleTextRangeCfiForTextElementSelectedByFunc(_.first, visibleContentOffsets, frameDimensions);
    }

    this.getFirstVisibleCfi = function (visibleContentOffsets, frameDimensions) {
        return getFirstVisibleTextRangeCfi(visibleContentOffsets, frameDimensions);
    };

    this.getLastVisibleCfi = function (visibleContentOffsets, frameDimensions) {
        return getLastVisibleTextRangeCfi(visibleContentOffsets, frameDimensions);
    };

    function generateCfiFromDomRange(range) {
        return EPUBcfi.generateRangeComponent(
            range.startContainer, range.startOffset,
            range.endContainer, range.endOffset,
            ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"]);
    }

    function getRangeTargetNodes(rangeCfi) {
        return EPUBcfi.getRangeTargetElements(
            getWrappedCfiRelativeToContent(rangeCfi),
            self.getRootDocument(),
            ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"]);
    }

    this.getDomRangeFromRangeCfi = function (rangeCfi, rangeCfi2, inclusive) {
        var range = createRange();

        if (!rangeCfi2) {
            if (self.isRangeCfi(rangeCfi)) {
                var rangeInfo = getRangeTargetNodes(rangeCfi);
                range.setStart(rangeInfo.startElement, rangeInfo.startOffset);
                range.setEnd(rangeInfo.endElement, rangeInfo.endOffset);
            } else {
                var element = self.getElementByCfi(rangeCfi,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.selectNode(element);
            }
        } else {
            if (self.isRangeCfi(rangeCfi)) {
                var rangeInfo1 = getRangeTargetNodes(rangeCfi);
                range.setStart(rangeInfo1.startElement, rangeInfo1.startOffset);
            } else {
                var startElement = self.getElementByCfi(rangeCfi,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.setStart(startElement, 0);
            }

            if (self.isRangeCfi(rangeCfi2)) {
                var rangeInfo2 = getRangeTargetNodes(rangeCfi2);
                if (inclusive) {
                    range.setEnd(rangeInfo2.endElement, rangeInfo2.endOffset);
                } else {
                    range.setEnd(rangeInfo2.startElement, rangeInfo2.startOffset);
                }
            } else {
                var endElement = self.getElementByCfi(rangeCfi2,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.setEnd(endElement, endElement.childNodes.length);
            }
        }
        return range;
    };

    this.getRangeCfiFromDomRange = function (domRange) {
        return generateCfiFromDomRange(domRange);
    };

    function getWrappedCfi(partialCfi) {
        return "epubcfi(" + partialCfi + ")";
    }

    function getWrappedCfiRelativeToContent(partialCfi) {
        return "epubcfi(/99!" + partialCfi + ")";
    }

    this.isRangeCfi = function (partialCfi) {
        return EPUBcfi.Interpreter.isRangeCfi(getWrappedCfi(partialCfi)) ||
                EPUBcfi.Interpreter.isRangeCfi(getWrappedCfiRelativeToContent(partialCfi));
    };

    this.getPageForElementCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {
        var cfiParts = splitCfi(cfi);
        var partialCfi = cfiParts.cfi;

        if (this.isRangeCfi(partialCfi)) {
            //if given a range cfi the exact page index needs to be calculated by getting node info from the range cfi
            var nodeRangeInfoFromCfi = this.getNodeRangeInfoFromCfi(partialCfi);
            //the page index is calculated from the node's client rectangle
            return findPageBySingleRectangle(nodeRangeInfoFromCfi.clientRect);
        }

        var $element = getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);

        if (!$element) {
            return -1;
        }

        return this.getPageForPointOnElement($element, cfiParts.x, cfiParts.y);

    };

    function getElementByPartialCfi(cfi, classBlacklist, elementBlacklist, idBlacklist) {
        var contentDoc = self.getRootDocument();
        var wrappedCfi = getWrappedCfi(cfi);
        var $element;
        try {
            $element = EPUBcfi.getTargetElementWithPartialCFI(wrappedCfi, contentDoc, classBlacklist, elementBlacklist, idBlacklist);

        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
            console.error('getTargetElementWithPartialCFI exception, wrappedCfi: %o, e: %o', wrappedCfi, ex);
        }

        if (!$element || $element.length === 0) {
            console.error("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    }

    this.getElementFromPoint = function (x, y) {
        var document = self.getRootDocument();
        return document.elementFromPoint(x, y);
    };

    this.getNodeRangeInfoFromCfi = function (cfi) {
        var contentDoc = self.getRootDocument();
        if (self.isRangeCfi(cfi)) {
            var wrappedCfi = getWrappedCfiRelativeToContent(cfi);

            var nodeResult;
            try {
                nodeResult = EPUBcfi.Interpreter.getRangeTargetElements(wrappedCfi, contentDoc,
                    ["cfi-marker"],
                    [],
                    ["MathJax_Message", "MathJax_SVG_Hidden"]);

                if (debugMode) {
                    console.log(nodeResult);
                }
            } catch (ex) {
                //EPUBcfi.Interpreter can throw a SyntaxError
                console.error('getNodeRangeInfoFromCfi exception, cfi: %o, e: %o', cfi, ex);
            }

            if (!nodeResult) {
                console.error("Can't find nodes for range CFI: " + cfi);
                return undefined;
            }

            var startRangeInfo = {node: nodeResult.startElement, offset: nodeResult.startOffset};
            var endRangeInfo = {node: nodeResult.endElement, offset: nodeResult.endOffset};
            var nodeRangeClientRect =
                startRangeInfo && endRangeInfo ?
                    getNodeRangeClientRect(
                        startRangeInfo.node,
                        startRangeInfo.offset,
                        endRangeInfo.node,
                        endRangeInfo.offset)
                    : null;

            if (debugMode) {
                console.log(nodeRangeClientRect);
                addOverlayRect(nodeRangeClientRect, 'purple', contentDoc);
            }

            return {startInfo: startRangeInfo, endInfo: endRangeInfo, clientRect: nodeRangeClientRect};
        } else {
            var $element = self.getElementByCfi(cfi,
                ["cfi-marker"],
                [],
                ["MathJax_Message", "MathJax_SVG_Hidden"]);

            var visibleContentOffsets = getVisibleContentOffsets();
            var normRects = getNormalizedRectangles($element[0], visibleContentOffsets);

            return {startInfo: null, endInfo: null, clientRect: normRects.wrapperRectangle};
        }
    };

    this.isNodeFromRangeCfiVisible = function (cfi) {
        var nodeRangeInfo = this.getNodeRangeInfoFromCfi(cfi);
        if (nodeRangeInfo) {
            return isRectVisible(nodeRangeInfo.clientRect, false);
        } else {
            return undefined;
        }
    };

    this.getElementByCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {
        var cfiParts = splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    this.getPageForElement = function ($element) {
        return this.getPageForPointOnElement($element, 0, 0);
    };

    this.getPageForPointOnElement = function ($element, x, y) {
        var pageIndex = findPageByRectangles($element, y);
        if (pageIndex === null) {
            console.warn('Impossible to locate a hidden element: ', $element);
            return 0;
        }
        return pageIndex;
    };

    this.getElementById = function (id) {
        var contentDoc = this.getRootDocument();
        var $element = $(contentDoc.getElementById(id));
        if ($element.length === 0) {
            return undefined;
        }

        return $element;
    };

    this.getPageForElementId = function (id) {
        var $element = this.getElementById(id);
        if (!$element) {
            return -1;
        }

        return this.getPageForElement($element);
    };

    function splitCfi(cfi) {
        var ret = {
            cfi: "",
            x: 0,
            y: 0
        };

        var ix = cfi.indexOf("@");

        if (ix !== -1) {
            var terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if (colIx !== -1) {
                ret.x = parseInt(terminus.substr(0, colIx), 10);
                ret.y = parseInt(terminus.substr(colIx + 1), 10);
            } else {
                console.error("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        } else {
            ret.cfi = cfi;
        }

        return ret;
    }

    // returns raw DOM element (not $ jQuery-wrapped)
    this.getFirstVisibleMediaOverlayElement = function (visibleContentOffsets) {
        var root = this.getBodyElement();
        if (!root) {
            return undefined;
        }

        var that = this;
        var firstPartial = false;
        function traverseArray(arr) {
            if (!arr || !arr.length) {
                return undefined;
            }

            for (var i = 0, count = arr.length; i < count; i++) {
                var item = arr[i];
                if (!item) {
                    continue;
                }

                var $item = $(item);
                if ($item.data("mediaOverlayData")) {
                    var visible = that.getElementVisibility($item, visibleContentOffsets);
                    if (visible) {
                        if (!firstPartial) {
                            firstPartial = item;
                        }
                        if (visible === 100) {
                            return item;
                        }
                    }
                } else {
                    var elem = traverseArray(item.children);
                    if (elem) {
                        return elem;
                    }
                }
            }

            return undefined;
        }

        var el = traverseArray([root]);
        if (!el) {
            el = firstPartial;
        }
        return el;
    };

    this.getElementVisibility = function ($element, visibleContentOffsets) {
        return checkVisibilityByRectangles($element, true, visibleContentOffsets);
    };

    this.isElementVisible = checkVisibilityByRectangles;

    this.getVisibleElementsWithFilter = function (visibleContentOffsets, filterFunction) {
        var $elements = this.getElementsWithFilter(this.getBodyElement(), filterFunction);
        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getAllElementsWithFilter = function (filterFunction) {
        return this.getElementsWithFilter(this.getBodyElement(), filterFunction);
    };

    this.getAllVisibleElementsWithSelector = function (selector, visibleContentOffset) {
        var elements = $(selector, this.getRootElement());
        var $newElements = [];
        $.each(elements, function () {
            $newElements.push($(this));
        });
        return this.getVisibleElements($newElements, visibleContentOffset);
    };

    this.getVisibleElements = function ($elements, visibleContentOffsets, frameDimensions, pickerFunc) {
        // ### tss: precalculate visibleContentOffsets and frameDimensions to avoid calculation in large loop
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        // ### tss: algo changes: breaking on first/last fully visible element,
        // if pickerFunc is either _.first or _.last
        var visibleElements = [];
        var i = 0;
        var len = $elements.length;
        var visibilityPercentage;
        var next = function () {
            return i < len && $elements[i++];
        };
        if (pickerFunc === _.first) {
            // will break on first found element
            next = function () {
                return visibilityPercentage !== 100 && i < len && $elements[i++];
            };
        } else if (pickerFunc === _.last) {
            // will break on first (from the end) found element
            i = len - 1;
            next = function () {
                return visibilityPercentage !== 100 && i >= 0 && $elements[i--];
            };
        }

        var $node;
        /* jshint -W084 */
        while ($node = next()) {
            var isTextNode = $node[0].nodeType === Node.TEXT_NODE;
            var $element = isTextNode ? $node.parent() : $node;
            visibilityPercentage = checkVisibilityByRectangles(
                $element, true, visibleContentOffsets, frameDimensions);

            if (visibilityPercentage) {
                visibleElements.push({
                    element: $element[0], // DOM Element is pushed
                    textNode: isTextNode ? $node[0] : null,
                    percentVisible: visibilityPercentage
                });
            }
        }
        /* jshint +W084 */

        if (pickerFunc === _.last) {
            visibleElements.reverse();
        }

        return visibleElements;
    };

    function _getVisibleLeafNodesCacheKey(paginationInfo, visibleContentOffsets, frameDimensions, pickerFunc) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        return JSON.stringify($.extend({}, paginationInfo, visibleContentOffsets, frameDimensions)) +
                (pickerFunc ? pickerFunc.toString() : '');
    }

    // ### tss: skip getting leaves if parent node is fully not visible
    // (originally this.getLeafNodeElements(this.getBodyElement()) was here)
    this._getVisibleCandidates = function (root, visibleContentOffsets, frameDimensions) {
        var cacheKey;
        if (_cacheEnabled) {
            cacheKey = _getVisibleLeafNodesCacheKey(options.paginationInfo, visibleContentOffsets, frameDimensions);
            if (root.cacheKey === cacheKey) {
                return root.cacheVisibleCandidates;
            }
            delete root.cacheKey;
            delete root.cacheVisibleCandidates;
        }

        var $candidates = [];

        if (!isElementBlacklisted($(root))) {
            var hiddenContCounter = 0;
            var visibleCounter = 0;
            for (var i = 0, len = root.childNodes.length; i < len; ++i) {
                // break if we already found some fully visible elements and now iterating over hidden
                if (hiddenContCounter > 5 && visibleCounter) {
                    break;
                }

                var childElement = root.childNodes[i];
                if (isElementBlacklisted($(childElement))) {
                    continue;
                }

                if (childElement.nodeType === Node.ELEMENT_NODE) {
                    var visibilityPercentage = checkVisibilityByRectangles(childElement, true, visibleContentOffsets, frameDimensions);
                    if (visibilityPercentage > 0) {
                        if (visibilityPercentage === 100) {
                            Array.prototype.push.apply($candidates, this.getLeafNodeElements(childElement));
                        } else {
                            var res = this._getVisibleCandidates(childElement);
                            if (res.length) {
                                Array.prototype.push.apply($candidates, res);
                            } else {
                                $candidates.push($(childElement));
                            }
                        }
                        hiddenContCounter = 0;
                        ++visibleCounter;
                    } else {
                        ++hiddenContCounter;
                    }
                } else if (childElement.nodeType === Node.TEXT_NODE && isValidTextNodeContent(childElement.nodeValue)) {
                    $candidates.push($(childElement));
                    hiddenContCounter = 0;
                }
            }
        }

        if (_cacheEnabled) {
            root.cacheKey = cacheKey;
            root.cacheVisibleCandidates = $candidates;
        }

        return $candidates;
    };

    this.getVisibleLeafNodes = function (visibleContentOffsets, frameDimensions, pickerFunc) {
        var cacheKey;
        if (_cacheEnabled) {
            cacheKey = _getVisibleLeafNodesCacheKey(options.paginationInfo, visibleContentOffsets, frameDimensions, pickerFunc);
            var fromCache = _cacheVisibleLeafNodes.get(cacheKey);
            if (fromCache) {
                return fromCache;
            }
        }

        // ### tss: new _getVisibleCandidates instead of getting all leaf nodes based algo
        var start = Date.now();
        var $candidates = this._getVisibleCandidates(this.getBodyElement());
        if ($candidates.length === 0) {
            console.error('getVisibleLeafNodes: no visible candidates');
        }
        var visibleElements = this.getVisibleElements($candidates, visibleContentOffsets, frameDimensions, pickerFunc);
        if (cfiDebug) {
            console.log('getVisibleLeafNodes time: ' + (Date.now() - start) + 'ms');
        }

        if (_cacheEnabled) {
            _cacheVisibleLeafNodes.set(cacheKey, visibleElements);
        }

        return visibleElements;
    };

    this.getElementsWithFilter = function (root, filterFunction) {
        var $elements = [];

        function traverseCollection(elements) {
            if (!elements) {
                return;
            }
            for (var i = 0, count = elements.length; i < count; i++) {
                var $element = $(elements[i]);
                if (filterFunction($element)) {
                    $elements.push($element);
                } else {
                    traverseCollection($element[0].children);
                }
            }
        }

        traverseCollection([root]);

        return $elements;
    };

    function isElementBlacklisted($element) {
        return EPUBcfi.applyBlacklist($element, ["cfi-marker", "mo-cfi-highlight"], [],
                ["MathJax_Message", "MathJax_SVG_Hidden"]).length === 0;
    }

    this.getLeafNodeElements = function (root) {
        if (_cacheEnabled && root.leafNodes) {
            return root.cacheLeafNodes;
        }

        //jshint bitwise:false
        var nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, function () {
            return NodeFilter.FILTER_ACCEPT;
        }, false);
        //jshint bitwise:true

        var $leafNodeElements = [];

        var node;
        /* jshint -W084 */
        while (node = nodeIterator.nextNode()) {
            var isLeafNode = node.nodeType === Node.ELEMENT_NODE && !node.childElementCount && !isValidTextNodeContent(node.textContent);
            if (isLeafNode || isValidTextNode(node)) {
                var $node = $(node);
                var $element = node.nodeType === Node.TEXT_NODE ? $node.parent() : $node;
                if (!isElementBlacklisted($element)) {
                    $leafNodeElements.push($node);
                }
            }
        }
        /* jshint +W084 */

        if (_cacheEnabled) {
            root.cacheLeafNodes = $leafNodeElements;
        }

        return $leafNodeElements;
    };

    function isValidTextNode(node) {
        return node.nodeType === Node.TEXT_NODE && isValidTextNodeContent(node.nodeValue);
    }

    function isValidTextNodeContent(text) {
        // Heuristic to find a text node with actual text
        // If we don't do this, we may get a reference to a node that doesn't get rendered
        // (such as for example a node that has tab character and a bunch of spaces)
        // this is would be bad! ask me why.
        return text.trim().length > 0;
    }

    this.getElements = function (selector) {
        return !selector ? $(this.getRootElement()).children() : $(selector, this.getRootElement());
    };

    this.getElement = function (selector) {
        var $element = this.getElements(selector);
        return $element.length > 0 ? $element : undefined;
    };

    this.destroy = function () {
        if (cfiDebug) {
            ReadiumSDK.reader.off(ReadiumSDK.Events.PAGINATION_CHANGED, ReadiumSDK._DEBUG_CfiNavigationLogic.debugVisibleCfis);
        }
    };

    //if (debugMode) {

    //used for visual debug atm
    function getRandomColor() {
        var letters = '0123456789ABCDEF'.split('');
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.round(Math.random() * 15)];
        }
        return color;
    }

    //used for visual debug atm
    function addOverlayRect(rects, color, doc) {
        var random = getRandomColor();
        if (!(rects instanceof Array)) {
            rects = [rects];
        }
        for (var i = 0; i !== rects.length; i++) {
            var rect = rects[i];
            var overlayDiv = doc.createElement('div');
            overlayDiv.style.position = 'absolute';
            $(overlayDiv).css('z-index', '1000');
            $(overlayDiv).css('pointer-events', 'none');
            $(overlayDiv).css('opacity', '0.4');
            overlayDiv.style.border = '1px solid white';
            if (!color && !random) {
                overlayDiv.style.background = 'purple';
            } else if (random && !color) {
                overlayDiv.style.background = random;
            } else {
                if (color === true) {
                    color = 'red';
                }
                overlayDiv.style.border = '1px dashed yellow';
                overlayDiv.style.background = color;
            }

            overlayDiv.style.margin = overlayDiv.style.padding = '0';
            overlayDiv.style.top = rect.top + 'px';
            overlayDiv.style.left = rect.left + 'px';
            // we want rect.width to be the border width, so content width is 2px less.
            overlayDiv.style.width = rect.width - 2 + 'px';
            overlayDiv.style.height = rect.height - 2 + 'px';
            overlayDiv.className = 'cfiDebug';
            doc.documentElement.appendChild(overlayDiv);
        }
    }

    function drawDebugOverlayFromRect(rect, color) {
        var leftOffset, topOffset;

        if (isVerticalWritingMode()) {
            leftOffset = 0;
            topOffset = -getPaginationLeftOffset();
        } else {
            leftOffset = -getPaginationLeftOffset();
            topOffset = 0;
        }

        addOverlayRect({
            left: rect.left + leftOffset,
            top: rect.top + topOffset,
            width: Math.max(rect.width, 5),
            height: Math.max(rect.height, 5)
        }, color || true, self.getRootDocument());
    }

    function drawDebugOverlayFromDomRange(range, color) {
        var rect = getNodeRangeClientRect(
            range.startContainer,
            range.startOffset,
            range.endContainer,
            range.endOffset);
        drawDebugOverlayFromRect(rect, color);
        return rect;
    }

    function drawDebugOverlayFromNode(node, color) {
        drawDebugOverlayFromRect(getNodeClientRect(node), color);
    }

    function drawDebugOverlayFromCfi(cfi, color) {
        if (!cfi) {
            return;
        }

        if (cfi.indexOf(',') !== -1) {
            drawDebugOverlayFromDomRange(self.getDomRangeFromRangeCfi(cfi), color);
        } else {
            var $el = EPUBcfi.getTargetElement(getWrappedCfiRelativeToContent(cfi), self.getRootDocument(),
                    ['cfi-marker', 'MathJax_Preview', 'MathJax_SVG_Display'],
                    [], ['MathJax_Message', 'MathJax_SVG_Hidden']);
            drawDebugOverlayFromRect(getNodeClientRect($el[0]), color);
        }
        return cfi;
    }

    function getPaginationLeftOffset() {
        var $htmlElement = $("html", self.getRootDocument());
        var offsetLeftPixels = $htmlElement.css(isVerticalWritingMode() ? "top" : isPageProgressionRightToLeft() ? "right" : "left");
        var offsetLeft = parseInt(offsetLeftPixels, 10);
        if (isNaN(offsetLeft)) {
            //for fixed layouts, $htmlElement.css("left") has no numerical value
            offsetLeft = 0;
        }
        if (isPageProgressionRightToLeft() && !isVerticalWritingMode()) {
            return -offsetLeft;
        }
        return offsetLeft;
    }

    function clearDebugOverlays() {
        if (self.getRootDocument()) {
            Array.prototype.slice.apply(self.getRootDocument().querySelectorAll('.cfiDebug')).forEach(function (el) {
                if (el.remove) {
                    el.remove();
                } else {
                    el.parentNode.removeChild(el);
                }
            });
        }
    }

    //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
    ReadiumSDK._DEBUG_CfiNavigationLogic = {
        clearDebugOverlays: clearDebugOverlays,
        drawDebugOverlayFromRect: drawDebugOverlayFromRect,
        drawDebugOverlayFromDomRange: drawDebugOverlayFromDomRange,
        drawDebugOverlayFromNode: drawDebugOverlayFromNode,
        debugVisibleCfis: function () {
            clearDebugOverlays();

            var cfi1 = drawDebugOverlayFromCfi(self.getFirstVisibleCfi(), 'red');
            var cfi2 = drawDebugOverlayFromCfi(self.getLastVisibleCfi(), 'green');
            var cfi3 = drawDebugOverlayFromCfi(ReadiumSDK.reader.getCurrentView().getSecondSpreadFirstVisibleCfi ?
                ReadiumSDK.reader.getCurrentView().getSecondSpreadFirstVisibleCfi() : null, 'orange');

            console.log('firstVisibleCfi: %o, lastVisibleCfi: %o, getSecondSpreadFirstVisibleCfi: %o',
                cfi1, cfi2, cfi3);
        }
    };

    if (cfiDebug) {
        ReadiumSDK.reader.on(ReadiumSDK.Events.PAGINATION_CHANGED, ReadiumSDK._DEBUG_CfiNavigationLogic.debugVisibleCfis);
    }
};
});
