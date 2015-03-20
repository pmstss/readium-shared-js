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


ReadiumSDK.Helpers.Navigation = function (context) {
    var self = this;

    var $iframe = context.$iframe;
    var $viewport = context.$viewport;

    /**
     * Checks whether or not pages are rendered right-to-left
     *
     * @returns {boolean}
     */
    self.isPageProgressionRightToLeft = function() {
        return context.paginationInfo && !!context.paginationInfo.rightToLeft;
    };

    /**
     * Checks whether or not pages are rendered with vertical writing mode
     *
     * @returns {boolean}
     */
    self.isVerticalWritingMode = function() {
        return context.paginationInfo && !!context.paginationInfo.isVerticalWritingMode;
    };


    self.getRootDocument = function () {
        return $iframe[0].contentDocument;
    };

    self.getRootElement = function () {
        return self.getRootDocument().contentDocument;
    };

    self.createRange = function() {
        return self.getRootDocument().createRange();
    };

    self.getNodeClientRect = function (node) {
        var range = self.createRange();
        range.selectNode(node);
        return self.normalizeRectangle(range.getBoundingClientRect(),0,0);
    };

    self.getElementClientRect = function ($element) {
        return self.normalizeRectangle($element[0].getBoundingClientRect(),0,0);
    };

    self.getNodeRangeClientRect = function (startNode, startOffset, endNode, endOffset) {
        var range = createRange();
        range.setStart(startNode, startOffset ? startOffset : 0);
        if (endNode.nodeType === Node.ELEMENT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : endNode.childNodes.length);
        } else if (endNode.nodeType === Node.TEXT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : 0);
        }
        return self.normalizeRectangle(range.getBoundingClientRect(),0,0);
    };

    self.isValidRect = function(){
        //Text nodes without printable text dont have client rectangles
        if (!rect) {
            return false;
        }
        //Sometimes we get client rects that are "empty" and aren't supposed to be visible
        else if (rect.left == 0 && rect.right == 0 && rect.top == 0 && rect.bottom == 0) {
            return false;
        }
        return true;
    };

    self.isRectFullyVisible = function(rect) {
        if (!self.isValidRect(rect)) return false;
        if (self.isVerticalWritingMode()) {
            return rect.top >= 0 && rect.bottom <= self.getRootDocumentClientHeight();
        }
        return (rect.left >= 0 && rect.right <= self.getRootDocumentClientWidth());
    };

    /**
     * Checks whether or not a (fully adjusted) rectangle is at least partly visible
     *
     * @param {Object} rect
     * @returns {boolean}
     */
    self.isRectPartlyVisible = function (rect) {
        if (!self.isValidRect(rect)) return false;
        if (context.isVwm) {
            return rect.top >= 0 && rect.top < self.getRootDocumentClientHeight();
        }
        return rect.left >= 0 && rect.left < self.getRootDocumentClientWidth();
    };

    self.getRootDocumentClientWidth = function() {
        return self.getRootElement().clientWidth;
    };

    self.getRootDocumentClientHeight = function () {
        return self.getRootElement().clientHeight;
    };

    /**
     * Retrieves _current_ full width of a column (including its gap)
     *
     * @returns {number} Full width of a column in pixels
     */
    self.getColumnFullWidth = function() {

        if (!context.paginationInfo || self.isVerticalWritingMode())
        {
            return self.getRootDocumentClientWidth();
        }

        return context.paginationInfo.columnWidth + context.paginationInfo.columnGap;
    };


    /**
     * Converts TextRectangle object into a plain object,
     * taking content offsets (=scrolls, position shifts etc.) into account
     *
     * @param {TextRectangle} textRect
     * @param {number} leftOffset
     * @param {number} topOffset
     * @returns {Object}
     */
    self.normalizeRectangle = function(textRect, leftOffset, topOffset) {

        var plainRectObject = {
            left: textRect.left,
            right: textRect.right,
            top: textRect.top,
            bottom: textRect.bottom,
            width: textRect.right - textRect.left,
            height: textRect.bottom - textRect.top
        };
        self.offsetRectangle(plainRectObject, leftOffset, topOffset);
        return plainRectObject;
    };
    /**
     * Offsets plain object (which represents a TextRectangle).
     *
     * @param {Object} rect
     * @param {number} leftOffset
     * @param {number} topOffset
     */
    self.offsetRectangle = function(rect, leftOffset, topOffset) {

        rect.left   += leftOffset;
        rect.right  += leftOffset;
        rect.top    += topOffset;
        rect.bottom += topOffset;
    }


};

/**
 *
 * @param left
 * @param top
 * @param width
 * @param height
 * @constructor
 */
ReadiumSDK.Helpers.Rect = function(left, top, width, height) {

    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;

    this.right = function () {
        return this.left + this.width;
    };

    this.bottom = function() {
        return this.top + this.height;
    };

    this.isOverlap = function(rect, tolerance) {

        if(tolerance == undefined) {
            tolerance = 0;
        }

        return !(rect.right() < this.left + tolerance ||
        rect.left > this.right() - tolerance ||
        rect.bottom() < this.top + tolerance ||
        rect.top > this.bottom() - tolerance);
    }
};

/**
 *
 * @param $element
 * @returns {ReadiumSDK.Helpers.Rect}
 */
//This method treats multicolumn view as one long column and finds the rectangle of the element in this "long" column
//we are not using jQuery Offset() and width()/height() function because for multicolumn rendition_layout it produces rectangle as a bounding box of element that
// reflows between columns this is inconstant and difficult to analyze .
ReadiumSDK.Helpers.Rect.fromElement = function($element) {

    var e;
    if (_.isArray($element) || $element instanceof jQuery)
        e = $element[0];
    else
        e = $element;
    // TODODM this is somewhat hacky. Text (range?) elements don't have a position so we have to ask the parent.
    if (e.nodeType === 3)
    {
        e = $element.parent()[0];
    }


    var offsetLeft = e.offsetLeft;
    var offsetTop = e.offsetTop;
    var offsetWidth = e.offsetWidth;
    var offsetHeight = e.offsetHeight;

    while(e = e.offsetParent) {
        offsetLeft += e.offsetLeft;
        offsetTop += e.offsetTop;
    }

    return new ReadiumSDK.Helpers.Rect(offsetLeft, offsetTop, offsetWidth, offsetHeight);
};

