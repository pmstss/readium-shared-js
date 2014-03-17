//  LauncherOSX
//
//  Created by Boris Schneiderman.
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

/*
 * CFI navigation helper class
 *
 * @param $viewport
 * @param $iframe
 * @param options Additional settings for NavigationLogic object
 *      - rectangleBased    If truthy, clientRect-based geometry will be used
 *      - paginationInfo    Layout details, used by clientRect-based geometry
 * @constructor
 */

ReadiumSDK.Views.CfiNavigationLogic = function ($viewport, $iframe, options) {

    var self = this;
    options = options || {};

    this.getRootElement = function () {

        return $iframe[0].contentDocument.documentElement;
    };

    this.getRootDocument = function () {
        return $iframe[0].contentDocument;
    };

    /* <-debug
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
     for (var i = 0; i != rects.length; i++) {
     var rect = rects[i];
     var tableRectDiv = doc.createElement('div');
     tableRectDiv.style.position = 'absolute';
     $(tableRectDiv).css('z-index', '-1');
     $(tableRectDiv).css('opacity', '0.4');
     tableRectDiv.style.border = '1px solid white';
     if (!color && !random) {
     tableRectDiv.style.background = 'purple';
     } else if (random && !color) {
     tableRectDiv.style.background = random;
     } else {
     if(color === true){
     color ='red';
     }
     tableRectDiv.style.border = '1px solid '+color;
     tableRectDiv.style.background = 'red';
     }

     tableRectDiv.style.margin = tableRectDiv.style.padding = '0';
     tableRectDiv.style.top = (rect.top ) + 'px';
     tableRectDiv.style.left = (rect.left ) + 'px';
     // we want rect.width to be the border width, so content width is 2px less.
     tableRectDiv.style.width = (rect.width - 2) + 'px';
     tableRectDiv.style.height = (rect.height - 2) + 'px';
     doc.body.appendChild(tableRectDiv);
     }
     }

     function getPaginationLeftOffset() {

     var $htmlElement = $("html", self.getRootDocument());
     var offsetLeftPixels = $htmlElement.css("left");
     var offsetLeft = parseInt(offsetLeftPixels.replace("px", ""));
     if(isNaN(offsetLeft)){
     //for fixed layouts, $htmlElement.css("left") has no numerical value
     offsetLeft = 0;
     }
     return offsetLeft;
     }
     //debug -> */

    function createRange() {
        return self.getRootDocument().createRange();
    }

    function getTextNodeFragments(node, buffer, startOverride, endOverride) {

        if (!buffer && ReadiumSDK.Overrides.TextNodeFragmentBuffer) {
            buffer = ReadiumSDK.Overrides.TextNodeFragmentBuffer;
        } else if (!buffer) {
            buffer = 60;
        }

        //create our range
        var range = createRange();
        var collection = [];

        //allow the range offsets to be specified explicitly, without iteration
        if (startOverride && endOverride) {
            range.setStart(node, startOverride);
            range.setEnd(node, endOverride);
            return [
                {start: startOverride, end: endOverride, rect: range.getBoundingClientRect()}
            ];
        }

        //go through a "buffer" of characters to create the fragments
        for (var i = 0; i < node.length; i += buffer) {
            var start = i;
            var end = i + buffer;
            //create ranges for the character buffer
            range.setStart(node, start);
            if (end > node.length) {
                end = node.length;
            }
            range.setEnd(node, end);
            //get the client rectangle for this character buffer
            var rect = range.getBoundingClientRect();
            //push the character offsets and client rectangle associated with this buffer iteration
            collection.push({start: start, end: end, rect: rect})
        }
        return collection;
    }

    function getNodeClientRect(node) {
        var range = createRange();
        range.selectNode(node);
        return range.getBoundingClientRect();
    }

    function getElementClientRect($element) {
        return $element[0].getBoundingClientRect();
    }

    function getNodeRangeClientRect(startNode, startOffset, endNode, endOffset) {
        var range = createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range.getBoundingClientRect();
    }

    function isClientRectVisible(rect) {
        //Text nodes without printable text dont have client rectangles
        if (!rect) {
            return false;
        }
        return (rect.left >= 0 && rect.right <= getViewportClientWidth());
    }

    function getRootDocumentClientWidth() {
        return self.getRootElement().clientWidth;
    }

    function getViewportClientWidth() {
        return $iframe[0].clientWidth;
    }

    function getRootDocumentClientHeight() {
        return self.getRootElement().clientHeight;
    }

    function getFirstVisibleTextNodeRange(textNode) {

        //"split" the single textnode into fragments based on client rect calculations
        //the function used for this could be optimized further with a binary search like approach
        var fragments = getTextNodeFragments(textNode);
        var found = false;
        //go through each fragment, figure out which one is visible
        $.each(fragments, function (n, fragment) {
            var rect = fragment.rect;
            if (!found) {
                //if the fragment's left or right value is within the visible client boundaries
                //then this is the one we want
                if (isClientRectVisible(rect)) {
                    found = fragment;
                    /* <- debug
                     console.log("visible textnode fragment found:");
                     console.log(fragment);
                     console.log("------------");
                     //debug -> */
                }
            }
        });
        if (!found) {
            //if we didn't find a visible textnode fragment on the clientRect iteration
            //it might still mean that its visible, just only at the very end
            var endFragment = getTextNodeFragments(textNode, null, textNode.length - 1, textNode.length)[0];

            if (endFragment && isClientRectVisible(endFragment.rect)) {
                found = endFragment;
            } else {
                console.error("Error! No visible textnode fragment found!");
            }
        }
        //create an optimized range to return based on the fragment results
        var resultRangeData = {start: (found.end - 1), end: found.end};
        var resultRangeRect = getNodeRangeClientRect(textNode, resultRangeData.start, textNode, resultRangeData.end);
        return {start: resultRangeData.start, end: resultRangeData.end, rect: resultRangeRect};
    }


    var visibilityCheckerFunc = options.rectangleBased
        ? checkVisibilityByRectangles
        : checkVisibilityByVerticalOffsets;

    /**
     * @private
     * Checks whether or not pages are rendered right-to-left
     *
     * @returns {boolean}
     */
    function isPageProgressionRightToLeft() {
        return !!options.paginationInfo.rightToLeft;
    }

    /**
     * @private
     * Checks whether or not a (fully adjusted) rectangle is at least partly visible
     *
     * @param {Object} rect
     * @param {Object} frameDimensions
     * @returns {boolean}
     */
    function isRectVisible(rect, frameDimensions) {
        return rect.left >= 0 && rect.left < frameDimensions.width;
    }

    /**
     * @private
     * Retrieves _current_ full width of a column (including its gap)
     *
     * @returns {number} Full width of a column in pixels
     */
    function getColumnFullWidth() {
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
        return {
            left: options.paginationInfo.pageOffset
                * (isPageProgressionRightToLeft() ? -1 : 1)
        };
    }

    // Old (offsetTop-based) algorithm, useful in top-to-bottom layouts
    function checkVisibilityByVerticalOffsets($element, visibleContentOffsets, shouldCalculateVisibilityOffset) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);
        if (_.isNaN(elementRect.left)) {
            // this is actually a point element, doesnt have a bounding rectangle
            elementRect = new ReadiumSDK.Helpers.Rect(
                $element.position().top, $element.position().left, 0, 0);
        }
        var topOffset = visibleContentOffsets.top || 0;
        var isBelowVisibleTop = elementRect.bottom() > topOffset;
        var isAboveVisibleBottom = visibleContentOffsets.bottom !== undefined
            ? elementRect.top < visibleContentOffsets.bottom
            : true; //this check always passed, if corresponding offset isn't set

        var percentOfElementHeight = 0;
        if (isBelowVisibleTop && isAboveVisibleBottom) { // element is visible
            if (!shouldCalculateVisibilityOffset) {
                return 100;
            }
            else if (elementRect.top <= topOffset) {
                percentOfElementHeight = Math.ceil(
                    100 * (topOffset - elementRect.top) / elementRect.height
                );

                // below goes another algorithm, which has been used in getVisibleElements pattern,
                // but it seems to be a bit incorrect
                // (as spatial offset should be measured at the first visible point of the element):
                //
                // var visibleTop = Math.max(elementRect.top, visibleContentOffsets.top);
                // var visibleBottom = Math.min(elementRect.bottom(), visibleContentOffsets.bottom);
                // var visibleHeight = visibleBottom - visibleTop;
                // var percentVisible = Math.round((visibleHeight / elementRect.height) * 100);
            }
            return 100 - percentOfElementHeight;
        }
        return 0; // element isn't visible
    }

    /**
     * New (rectangle-based) algorithm, useful in multi-column layouts
     *
     * Note: the second param (props) is ignored intentionally
     * (no need to use those in normalization)
     *
     * @param {jQuery} $element
     * @param {Object} _props
     * @param {boolean} shouldCalculateVisibilityPercentage
     * @returns {number}
     *      0 for non-visible elements,
     *      0 < n <= 100 for visible elements
     *      (will just give 100, if `shouldCalculateVisibilityPercentage` => false)
     */
    function checkVisibilityByRectangles($element, _props, shouldCalculateVisibilityPercentage) {

        var elementRectangles = getNormalizedRectangles($element);
        var clientRectangles = elementRectangles.clientRectangles;

        var isRtl = isPageProgressionRightToLeft();
        var columnFullWidth = getColumnFullWidth();
        var frameDimensions = {
            width: $iframe.width(),
            height: $iframe.height()
        };

        if (clientRectangles.length === 1) {
            // because of webkit inconsistency, that single rectangle should be adjusted
            // until it hits the end OR will be based on the FIRST column that is visible
            adjustRectangle(clientRectangles[0], frameDimensions, columnFullWidth,
                isRtl, true);
        }

        // for an element split between several CSS columns,
        // both Firefox and IE produce as many client rectangles;
        // each of those should be checked
        var visibilityPercentage = 0;
        for (var i = 0, l = clientRectangles.length; i < l; ++i) {
            if (isRectVisible(clientRectangles[i], frameDimensions)) {
                visibilityPercentage = shouldCalculateVisibilityPercentage
                    ? measureVisibilityPercentageByRectangles(clientRectangles, i)
                    : 100;
                break;
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
     * @returns {number}
     */
    function findPageByRectangles($element, spatialVerticalOffset) {
        var visibleContentOffsets = getVisibleContentOffsets();
        var elementRectangles = getNormalizedRectangles($element, visibleContentOffsets);
        var clientRectangles = elementRectangles.clientRectangles;

        var isRtl = isPageProgressionRightToLeft();
        var columnFullWidth = getColumnFullWidth();
        var frameHeight = $iframe.height();
        var frameWidth = $iframe.width();

        if (spatialVerticalOffset) {
            trimRectanglesByVertOffset(clientRectangles, spatialVerticalOffset,
                frameHeight, columnFullWidth, isRtl);
        }

        var firstRectangle = _.first(clientRectangles);
        if (clientRectangles.length === 1) {
            adjustRectangle(firstRectangle, {
                height: frameHeight, width: frameWidth
            }, columnFullWidth, isRtl);
        }

        var leftOffset = firstRectangle.left;
        if (isRtl) {
            leftOffset = columnFullWidth * options.paginationInfo.visibleColumnCount - leftOffset;
        }

        var pageIndex = Math.floor(leftOffset / columnFullWidth);

        // fix for the glitch with first opening of the book with RTL dir and lang
        if (pageIndex < 0 || pageIndex >= options.paginationInfo.columnCount) {
            pageIndex = options.paginationInfo.visibleColumnCount - pageIndex;
        }

        return pageIndex;
    }

    /**
     * @private
     * Calculates the visibility offset percentage based on ClientRect dimensions
     *
     * @param {Array} clientRectangles (should already be normalized)
     * @param {number} firstVisibleRectIndex
     * @returns {number} - visibility percentage (0 < n <= 100)
     */
    function measureVisibilityPercentageByRectangles(clientRectangles, firstVisibleRectIndex) {

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
        }
        else {
            // should already be normalized and adjusted
            heightTotal = clientRectangles[0].height;
            heightVisible = clientRectangles[0].height - Math.max(
                0, -clientRectangles[0].top);
        }
        return heightVisible === heightTotal
            ? 100 // trivial case: element is 100% visible
            : Math.floor(100 * heightVisible / heightTotal);
    }

    /**
     * @private
     * Retrieves the position of $element in multi-column layout
     *
     * @param {jQuery} $el
     * @param {Object} [visibleContentOffsets]
     * @returns {Object}
     */
    function getNormalizedRectangles($el, visibleContentOffsets) {

        visibleContentOffsets = visibleContentOffsets || {};
        var leftOffset = visibleContentOffsets.left || 0;
        var topOffset = visibleContentOffsets.top || 0;

        // union of all rectangles wrapping the element
        var wrapperRectangle = normalizeRectangle(
            $el[0].getBoundingClientRect(), leftOffset, topOffset);

        // all the separate rectangles (for detecting position of the element
        // split between several columns)
        var clientRectangles = [];
        var clientRectList = $el[0].getClientRects();
        for (var i = 0, l = clientRectList.length; i < l; ++i) {
            if (clientRectList[i].height > 0) {
                // Firefox sometimes gets it wrong,
                // adding literally empty (height = 0) client rectangle preceding the real one,
                // that empty client rectanle shouldn't be retrieved
                clientRectangles.push(
                    normalizeRectangle(clientRectList[i], leftOffset, topOffset));
            }
        }

        return {
            wrapperRectangle: wrapperRectangle,
            clientRectangles: clientRectangles
        };
    }

    /**
     * @private
     * Converts TextRectangle object into a plain object,
     * taking content offsets (=scrolls, position shifts etc.) into account
     *
     * @param {TextRectangle} textRect
     * @param {number} leftOffset
     * @param {number} topOffset
     * @returns {Object}
     */
    function normalizeRectangle(textRect, leftOffset, topOffset) {

        var plainRectObject = {
            left: textRect.left,
            right: textRect.right,
            top: textRect.top,
            bottom: textRect.bottom,
            width: textRect.right - textRect.left,
            height: textRect.bottom - textRect.top
        };
        offsetRectangle(plainRectObject, leftOffset, topOffset);
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
     * @param {Object} frameDimensions
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     * @param {boolean} shouldLookForFirstVisibleColumn
     *      If set, there'll be two-phase adjustment
     *      (to align a rectangle with a viewport)
     */
    function adjustRectangle(rect, frameDimensions, columnFullWidth, isRtl, shouldLookForFirstVisibleColumn) {

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
                if (isRectVisible(rect, frameDimensions)) {
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
     * @param {number} frameHeight
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     */
    function trimRectanglesByVertOffset(rects, verticalOffset, frameHeight, columnFullWidth, isRtl) {

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
        }
        else {
            // rebase to the last possible column
            // (so that adding to top will be properly processed later)
            if (isRtl) {
                columnFullWidth *= -1;
            }
            while (rects[0].bottom >= frameHeight) {
                offsetRectangle(rects[0], columnFullWidth, -frameHeight);
            }

            rects[0].top += heightToHide;
            rects[0].height -= heightToHide;
        }
    }

    //we look for text and images
    this.findFirstVisibleElement = function (props) {

        if (typeof props !== 'object') {
            // compatibility with legacy code, `props` is `topOffset` actually
            props = { top: props };
        }

        var $elements, $element = null;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var foundTextNode = null;

        $elements = $("body", this.getRootElement()).find(":not(iframe)").contents().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        });

        // Find the first visible text node's parent element
        // or find the element in the case of an image
        $.each($elements, function () {

            var $element;

            if (this.nodeType === Node.TEXT_NODE) { //text node
                $element = $(this).parent();
                foundTextNode = this;
            }
            else {
                $element = $(this); //image
            }

            var visibilityResult = visibilityCheckerFunc($element, props, true);

            if (visibilityResult) {
                $firstVisibleTextNode = $element;
                percentOfElementHeight = 100 - visibilityResult;
                return false;
            }

            return true; //next element
        });

        if (foundTextNode && $element) {
            $elements = $element.find(":not(iframe)").addBack().contents().filter(function () {
                return isValidTextNode(this);
            });
            // Find (roughly) the first visible text node
            $.each($elements, function () {
                var nodeRect = getNodeClientRect(this);
                // if the rectangle's right is a positive value, this means that part of it has to be visible
                // from the client's perspective
                if (nodeRect.right > 0) {
                    foundTextNode = this;
                    // break the loop we found a visible text node
                    // but if its a large text node it still needs to be fragmented
                    // and further checked for visibility
                    return false;
                }

                return true;
            });
        }

        return {$element: $firstVisibleTextNode, percentY: percentOfElementHeight, foundTextNode: foundTextNode};
    };


    this.getFirstVisibleElementCfi = function (topOffset) {
        var cfi;
        var foundElement = this.findFirstVisibleElement(topOffset);
        var $element = foundElement.$element;

        // we may get a text node or an img element here. For a text node, we can generate a complete range CFI that 
        // most specific. 
        //
        // For an img node we generate an offset CFI
        var node = foundElement.foundTextNode;
        if (node) {

            var startRange, endRange;
            //if we get a text node we need to get an approximate range for the first visible character offsets.
            var nodeRange = getFirstVisibleTextNodeRange(node);
            startRange = nodeRange.start;
            endRange = nodeRange.end;
            /* <- debug
             var rect = nodeRange.rect;
             var leftOffset = -getPaginationLeftOffset();
             addOverlayRect({
             left: rect.left + leftOffset,
             top: rect.top,
             width: rect.width,
             height: rect.height
             }, true, self.getRootDocument());
             // debug -> */
            cfi = EPUBcfi.Generator.generateCharOffsetRangeComponent(node, startRange, node, endRange,
                ["cfi-marker"],
                [],
                ["MathJax_Message"]);
        } else if ($element) {
            //noinspection JSUnresolvedVariable
            cfi = EPUBcfi.Generator.generateElementCFIComponent(foundElement.$element[0],
                ["cfi-marker"],
                [],
                ["MathJax_Message"]);

            if (cfi[0] == "!") {
                cfi = cfi.substring(1);
            }

            cfi = cfi + "@0:" + foundElement.percentY;
        } else {
            console.log("Could not generate CFI no visible element on page");
        }

        //This should not happen but if it does print some output, just in case
        if (cfi && cfi.indexOf('NaN') !== -1) {
            console.log('Did not generate a valid CFI:' + cfi);
            return undefined;
        }

        return cfi;
    };

    function getWrappedCfi(partialCfi) {
        return "epubcfi(" + partialCfi + ")";
    }

    function getWrappedCfiRelativeToContent(partialCfi) {
        return "epubcfi(/99!" + partialCfi + ")";
    }

    this.isRangeCfi = function (partialCfi) {
        return EPUBcfi.Interpreter.isRangeCfi(getWrappedCfi(partialCfi));
    };

    this.getPageForElementCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var cfiParts = splitCfi(cfi);
        var partialCfi = cfiParts.cfi;

        var $element = getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);

        if (!$element) {
            return -1;
        }

        var pageIndex = this.getPageForPointOnElement($element, cfiParts.x, cfiParts.y);
        if (this.isRangeCfi(partialCfi)) {
            //if we get a range cfi we need to calculate the exact page index by getting node info from the range cfi
            var nodeRangeInfoFromCfi = this.getNodeRangeInfoFromCfi(partialCfi);
            //we need the very first node (text or not) from a parent to calculate proper page offsets
            var parentFirstNode = $element[0].childNodes[0];
            //the end node can just be the nodeRange start node since we only need left value offsets from parent
            var parentEndNode = nodeRangeInfoFromCfi.startInfo.node;
            //add the calculated page offset to final page index
            pageIndex += this.getPageOffsetFromClientRects(
                getNodeRangeClientRect(
                    parentFirstNode,
                    0,
                    parentEndNode,
                    parentEndNode.length),
                nodeRangeInfoFromCfi.clientRect);
        }
        return pageIndex;

    };

    function getElementByPartialCfi(cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var contentDoc = self.getRootDocument();

        var wrappedCfi = getWrappedCfi(cfi);

        try {
            //noinspection JSUnresolvedVariable
            var $element = EPUBcfi.getTargetElementWithPartialCFI(wrappedCfi, contentDoc, classBlacklist, elementBlacklist, idBlacklist);

        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if (!$element || $element.length == 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    }

    this.getNodeRangeInfoFromCfi = function (cfi) {
        var contentDoc = self.getRootDocument();

        var wrappedCfi = getWrappedCfiRelativeToContent(cfi);

        try {
            //noinspection JSUnresolvedVariable
            var nodeResult = EPUBcfi.Interpreter.getRangeTextNodes(wrappedCfi, contentDoc,
                ["cfi-marker"],
                [],
                ["MathJax_Message"]);
            /* <- debug
             console.log(nodeResult);
             */
        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if (!nodeResult) {
            console.log("Can't find nodes for range CFI: " + cfi);
            return undefined;
        }

        var startRangeInfo = getRangeInfoFromNodeList(nodeResult.startNodes, nodeResult.startOffset);
        var endRangeInfo = getRangeInfoFromNodeList(nodeResult.endNodes, nodeResult.endOffset);
        var nodeRangeClientRect = getNodeRangeClientRect(startRangeInfo.node, startRangeInfo.offset, endRangeInfo.node, endRangeInfo.offset);
        /* <- debug
         console.log(nodeRangeClientRect);
         addOverlayRect(nodeRangeClientRect,'purple',contentDoc);
         */

        return {startInfo: startRangeInfo, endInfo: endRangeInfo, clientRect: nodeRangeClientRect}
    };

    this.isNodeFromRangeCfiVisible = function (cfi) {
        var nodeRangeInfo = this.getNodeRangeInfoFromCfi(cfi);
        if (nodeRangeInfo) {
            return isClientRectVisible(nodeRangeInfo.clientRect);
        } else {
            return undefined;
        }
    };

    function getRangeInfoFromNodeList($textNodeList, textOffset) {

        var nodeNum;

        var currTextPosition = 0;
        var nodeOffset;

        for (nodeNum = 0; nodeNum <= $textNodeList.length; nodeNum++) {

            if ($textNodeList[nodeNum].nodeType === 3) {

                currNodeMaxIndex = $textNodeList[nodeNum].nodeValue.length + currTextPosition;
                nodeOffset = textOffset - currTextPosition;

                if (currNodeMaxIndex > textOffset) {
                    return {node: $textNodeList[nodeNum], offset: nodeOffset};
                } else if (currNodeMaxIndex == textOffset) {
                    return {node: $textNodeList[nodeNum], offset: $textNodeList[nodeNum].length};
                }
                else {

                    currTextPosition = currNodeMaxIndex;
                }
            }
        }

        return undefined;
    }

    this.getElementByCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var cfiParts = splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    this.getPageForElement = function ($element) {

        return this.getPageForPointOnElement($element, 0, 0);
    };

    this.getPageOffsetFromClientRects = function (parentRect, childRect, visibleColumnCount) {
        /* <- debug
         console.log("parentRect.left: " + parentRect.left);
         console.log("childRect.left: " + childRect.left);
         console.log("clientWidth: "+ getRootDocumentClientWidth());

         var pageOffset = Math.floor(((childRect.left - parentRect.left) / (getRootDocumentClientWidth()) * visibleColumnCount));
         console.log(pageOffset);
         console.log(Math.round(((childRect.left - parentRect.left) / (getRootDocumentClientWidth()) * visibleColumnCount)));
         */
        return Math.floor(((childRect.left - parentRect.left) / getViewportClientWidth()));

    };

    this.getPageForPointOnElement = function ($element, x, y) {

        if (options.rectangleBased) {
            try {
                return findPageByRectangles($element, y);
            }
            catch (e) // when clientRects fail (element display:none)
            {
                console.error(e);
                return 0;
            }
        }

        var posInElement = this.getVerticalOffsetForPointOnElement($element, x, y);
        return Math.floor(posInElement / $viewport.height());
    };

    this.getVerticalOffsetForElement = function ($element) {

        return this.getVerticalOffsetForPointOnElement($element, 0, 0);
    };

    this.getVerticalOffsetForPointOnElement = function ($element, x, y) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);
        return Math.ceil(elementRect.top + y * elementRect.height / 100);
    };

    this.getElementById = function (id) {

        var contentDoc = this.getRootDocument();

        var $element = $("#" + ReadiumSDK.Helpers.escapeJQuerySelector(id), contentDoc);
        if ($element.length == 0) {
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

        if (ix != -1) {
            var terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if (colIx != -1) {
                ret.x = parseInt(terminus.substr(0, colIx));
                ret.y = parseInt(terminus.substr(colIx + 1));
            }
            else {
                console.log("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        }
        else {

            ret.cfi = cfi;
        }

        return ret;
    }

    this.getFirstVisibleMediaOverlayElement = function (visibleContentOffsets) {
        var docElement = this.getRootElement();
        if (!docElement) return undefined;

        var $root = $("body", docElement);
        if (!$root || !$root[0]) return undefined;

        var that = this;

        var firstPartial = undefined;

        function traverseArray(arr) {
            if (!arr || !arr.length) return undefined;

            for (var i = 0, count = arr.length; i < count; i++) {
                var item = arr[i];
                if (!item) continue;

                var $item = $(item);

                if ($item.data("mediaOverlayData")) {
                    var visible = that.getElementVisibility($item, visibleContentOffsets);
                    if (visible) {
                        if (!firstPartial) firstPartial = item;

                        if (visible == 100) return item;
                    }
                }
                else {
                    var elem = traverseArray(item.children);
                    if (elem) return elem;
                }
            }

            return undefined;
        }

        var el = traverseArray([$root[0]]);
        if (!el) el = firstPartial;
        return el;

        // var $elements = this.getMediaOverlayElements($root);
        // return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getElementVisibility = function ($element, visibleContentOffsets) {
        return visibilityCheckerFunc($element, visibleContentOffsets, true);
    };

    /**
     * @deprecated
     */
    this.getVisibleMediaOverlayElements = function (visibleContentOffsets) {

        var $elements = this.getMediaOverlayElements($("body", this.getRootElement()));
        return this.getVisibleElements($elements, visibleContentOffsets);

    };

    this.isElementVisible = visibilityCheckerFunc;

    this.getVisibleElementsWithFilter = function (visibleContentOffsets, filterFunction) {

        var $elements = this.getElementsWithFilter($("body", this.getRootElement()), filterFunction);
        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getAllElementsWithFilter = function (filterFunction) {
        var $elements = this.getElementsWithFilter($("body", this.getRootElement()), filterFunction);
        return $elements;
    };

    this.isElementVisible = function ($element, visibleContentOffsets) {

        var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

        return !(elementRect.bottom() <= visibleContentOffsets.top || elementRect.top >= visibleContentOffsets.bottom);
    };

    this.getAllVisibleElementsWithSelector = function (selector, visibleContentOffset) {
        var elements = $(selector, this.getRootElement()).filter(function (e) {
            return true;
        });
        var $newElements = [];
        $.each(elements, function () {
            $newElements.push($(this));
        });
        var visibleDivs = this.getVisibleElements($newElements, visibleContentOffset);
        return visibleDivs;

    };

    this.getVisibleElements = function ($elements, visibleContentOffsets) {

        var visibleElements = [];

        // Find the first visible text node
        $.each($elements, function () {
            var $element = this;
            var visibilityPercentage = visibilityCheckerFunc(
                $element, visibleContentOffsets, true);

            if (visibilityPercentage) {
                var $visibleElement = $element;
                visibleElements.push({
                    element: $visibleElement[0], // DOM Element is pushed
                    percentVisible: visibilityPercentage
                });
                return false;
            }

            // continue if no visibleElements have been found yet,
            // stop otherwise
            return visibleElements.length === 0;
        });

        return visibleElements;
    };

    this.getVisibleTextElements = function (visibleContentOffsets) {

        var $elements = this.getTextElements($("body", this.getRootElement()));

        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getElementsWithFilter = function ($root, filterFunction) {

        var $elements = [];

        function traverseCollection(elements) {

            if (elements == undefined) return;

            for (var i = 0, count = elements.length; i < count; i++) {

                var $element = $(elements[i]);

                if (filterFunction($element)) {
                    $elements.push($element);
                }
                else {
                    traverseCollection($element[0].children);
                }

            }
        }

        traverseCollection([$root[0]]);

        return $elements;
    };

    this.getTextElements = function ($root) {

        var $textElements = [];

        $root.find(":not(iframe)").contents().each(function () {

            if (isValidTextNode(this)) {
                $textElements.push($(this).parent());
            }

        });

        return $textElements;

    };

    function isValidTextNode(node) {

        if (node.nodeType === Node.TEXT_NODE) {

            // Heuristic to find a text node with actual text
            // If we don't do this, we may get a reference to a node that doesn't get rendered
            // (such as for example a node that has tab character and a bunch of spaces) 
            // this is would be bad! ask me why.
            var nodeText = node.nodeValue.replace(/[\s\n\r\t]/g, "");
            return nodeText.length > 0;
        }

        return false;

    }

    this.getElements = function (selector) {
        if (!selector) {
            return $(this.getRootElement()).children();
        }
        return $(selector, this.getRootElement());
    };

    this.getElement = function (selector) {

        var $element = this.getElements(selector);

        if ($element.length > 0) {
            return $element[0];
        }

        return 0;
    };

};
