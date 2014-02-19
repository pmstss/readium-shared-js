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
 * @constructor
 */

ReadiumSDK.Views.CfiNavigationLogic = function ($viewport, $iframe) {

    var self = this;
    this.getRootElement = function () {

        return $iframe[0].contentDocument.documentElement;
    };

    this.getRootDocument = function () {
        return $iframe[0].contentDocument;
    };

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
    function addOverlayRect(rects, found, doc) {
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
            if (!found && !random) {
                tableRectDiv.style.background = 'purple';
            } else if (random && !found) {
                tableRectDiv.style.background = random;
            } else {
                tableRectDiv.style.border = '1px solid red';
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

    function getTextNodeFragments(node, contentDoc, buffer) {

        buffer = buffer ? buffer : 60;
        //create our range
        var range = contentDoc.createRange();
        var collection = [];
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

    function getTextNodeBoundingClientRect(node, contentDoc) {
        var range = contentDoc.createRange();
        range.selectNode(node);
        return range.getBoundingClientRect();
    }

    function getFirstVisibleTextNodeRange(textNode, contentDoc) {

        //"split" the single textnode into fragments based on client rect calculations
        //the function used for this could be optimized further with a binary search like approach
        var fragments = getTextNodeFragments(textNode, contentDoc);
        var found = false;
        //go through each fragment, figure out which one is visible
        $.each(fragments, function (n, fragment) {
            var rect = fragment.rect;
            if (!found) {
                //if the fragment's left or right value is within the visible client boundaries
                //then this is the one we want
                if (rect.left >= 0 || rect.right >= 0) {
                    found = fragment;
                    /* <- debug */
                    console.log("visible textnode fragment found:");
                    console.log(fragment);
                    console.log("------------");
                    /* debug -> */
                }
            }
        });
        if (!found) {
            console.error("Error! No visible textnode fragment found!");
        }
        //create an optimized range to return based on the fragment results
        var resultRangeData = {start: (found.end - 1), end: found.end};
        var resultRange = contentDoc.createRange();
        resultRange.setStart(textNode, resultRangeData.start);
        resultRange.setEnd(textNode, resultRangeData.end);
        return {start: resultRangeData.start, end: resultRangeData.end, rect: resultRange.getBoundingClientRect()};
    }

    function getPaginationLeftOffset() {

        var $htmlElement = $(self.getRootElement());
        var offsetLeftPixels = $htmlElement.css("left");
        return parseInt(offsetLeftPixels.replace("px", ""));
    }

    //we look for text and images
    this.findFirstVisibleElement = function (topOffset) {

        var $elements, $element = null;
        var $firstVisibleTextNode = null;
        var percentOfElementHeight = 0;
        var foundTextNode = null;

        $elements = $("body", this.getRootElement()).find(":not(iframe)").contents().filter(function () {
            return isValidTextNode(this) || this.nodeName.toLowerCase() === 'img';
        });

        var contentDoc = self.getRootDocument();
        // Find the first visible text node's parent element
        // or find the element in the case of an image
        $.each($elements, function () {

            if (this.nodeType === Node.TEXT_NODE) { //text node
                $element = $(this).parent();
                foundTextNode = this;
            }
            else {
                $element = $(this); //image
            }

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement($element);

            if (elementRect.bottom() > topOffset) {
                $firstVisibleTextNode = $element;
                if (elementRect.top > topOffset) {
                    percentOfElementHeight = 0;
                }
                else {
                    percentOfElementHeight = Math.ceil(((topOffset - elementRect.top) / elementRect.height) * 100);
                }
                // Break the loop
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
                var nodeRect = getTextNodeBoundingClientRect(this, contentDoc);
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
            var contentDoc = this.getRootDocument();
            window.contentDoc = contentDoc;
            var nodeRange = getFirstVisibleTextNodeRange(node, contentDoc);
            startRange = nodeRange.start;
            endRange = nodeRange.end;
            /* <- debug */
            var rect = nodeRange.rect;
            var leftOffset = -getPaginationLeftOffset();
            addOverlayRect({
                left: rect.left + leftOffset,
                top: rect.top,
                width: rect.width,
                height: rect.height
            }, true, contentDoc);
            /* debug -> */
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


        return cfi;
    };

    this.getPageForElementCfi = function (cfi) {

        var cfiParts = splitCfi(cfi);

        var $element = getElementByPartialCfi(cfiParts.cfi);

        if (!$element) {
            return -1;
        }

        return this.getPageForPointOnElement($element, cfiParts.x, cfiParts.y);
    };

    function getElementByPartialCfi(cfi) {

        var contentDoc = self.getRootDocument();

        var wrappedCfi = "epubcfi(" + cfi + ")";

        try {
            //noinspection JSUnresolvedVariable
            var $element = EPUBcfi.Interpreter.getTargetElementWithPartialCFI(wrappedCfi, contentDoc,
                ["cfi-marker"],
                [],
                ["MathJax_Message"]);
        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if (!$element || $element.length == 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    }

    this.isNodeFromRangeCfiVisible = function(cfi){

        var contentDoc = self.getRootDocument();

        var wrappedCfi = "epubcfi(/99!" + cfi + ")";

        try {
            //noinspection JSUnresolvedVariable
            var nodeResult = EPUBcfi.Interpreter.getRangeTextNodes(wrappedCfi, contentDoc,
                ["cfi-marker"],
                [],
                ["MathJax_Message"]);
            console.log(nodeResult);
        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if (!nodeResult) {
            console.log("Can't find nodes for range CFI: " + cfi);
            return undefined;
        }else{
            console.log(getRangeInfoFromNodeList(nodeResult.startNodes,nodeResult.startOffset));
            console.log(getRangeInfoFromNodeList(nodeResult.endNodes,nodeResult.endOffset));
        }



        return false;
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

    this.getElementByCfi = function (cfi) {

        var cfiParts = splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi);
    };


    this.getPageForElement = function ($element) {

        return this.getPageForPointOnElement($element, 0, 0);
    };

    this.getPageForPointOnElement = function ($element, x, y) {

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

    this.getElementBuyId = function (id) {

        var contentDoc = this.getRootDocument();

        var $element = $("#" + id, contentDoc);
        if ($element.length == 0) {
            return undefined;
        }

        return $element;
    };

    this.getPageForElementId = function (id) {

        var $element = this.getElementBuyId(id);
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

    this.getVisibleMediaOverlayElements = function (visibleContentOffsets) {

        var $elements = this.getElementsWithFilter($("body", this.getRootElement()), function ($element) {
            return $element.data("mediaOverlayData");
        });
        return this.getVisibleElements($elements, visibleContentOffsets);

    };


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

            var elementRect = ReadiumSDK.Helpers.Rect.fromElement(this);
            // this is actually a point element, doesnt have a bounding rectangle
            if (_.isNaN(elementRect.left)) {
                var left = this.position().left;
                var top = this.position().top;
                elementRect = new ReadiumSDK.Helpers.Rect(top, left, 0, 0);
            }

            if (elementRect.bottom() <= visibleContentOffsets.top) {
                return true; //next element
            }

            if (elementRect.top >= visibleContentOffsets.bottom) {

                // Break the loop
                return false;
            }

            var visibleTop = Math.max(elementRect.top, visibleContentOffsets.top);
            var visibleBottom = Math.min(elementRect.bottom(), visibleContentOffsets.bottom);

            var visibleHeight = visibleBottom - visibleTop;
            var percentVisible = Math.round((visibleHeight / elementRect.height) * 100);

            visibleElements.push({element: this[0], percentVisible: percentVisible});

            return true;

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
