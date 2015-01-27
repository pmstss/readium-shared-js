define("rangy", function(){});
var EpubAnnotationsModule = function (contentDocumentFrame, bbPageSetView, annotationCSSUrl) {
    
    var EpubAnnotations = {};
    
    //determine if browser is IE9 or IE10
    var div = document.createElement("div");
    div.innerHTML = "<!--[if IE 9]><i></i><![endif]-->";
    EpubAnnotations.isIe9 = (div.getElementsByTagName("i").length == 1);
    EpubAnnotations.isIe10 = false;
    /*@cc_on
     EpubAnnotations.isIe10 = (@_jscript_version == 10);
     @*/
    
    // for the lack of better place:
    window.clickEvt = 'ontouchstart' in document.documentElement ? "touchstart" : "click";
    
    
    // Rationale: The order of these matters
    EpubAnnotations.Helpers = {
        getMatrix: function ($obj) {
            var matrix = $obj.css("-webkit-transform") ||
            $obj.css("-moz-transform") ||
            $obj.css("-ms-transform") ||
            $obj.css("-o-transform") ||
            $obj.css("transform");
            return matrix === "none" ? undefined : matrix;
        },
        getScaleFromMatrix: function (matrix) {
            var matrixRegex = /matrix\((-?\d*\.?\d+),\s*0,\s*0,\s*(-?\d*\.?\d+),\s*0,\s*0\)/,
            matches = matrix.match(matrixRegex);
            return matches[1];
        }
    };
    EpubAnnotations.TextLineInferrer = Backbone.Model.extend({
        
        lineHorizontalThreshold: 0,
        lineHorizontalLimit: 0,
        
        initialize : function (attributes, options) {
            this.lineHorizontalThreshold = this.get("lineHorizontalThreshold");
            this.lineHorizontalLimit = this.get("lineHorizontalLimit");
        },
        
        // ----------------- PUBLIC INTERFACE --------------------------------------------------------------
        
        inferLines : function (rectList) {
            
            var inferredLines = [];
            var numRects = rectList.length;
            var numLines = 0;
            var currLine;
            var currRect;
            var rectAppended;
            
            // Iterate through each rect
            for (var currRectNum = 0; currRectNum <= numRects - 1; currRectNum++) {
                currRect = rectList[currRectNum];
                // Check if the rect can be added to any of the current lines
                rectAppended = false;
                for (var currLineNum = 0; currLineNum <= numLines - 1; currLineNum++) {
                    currLine = inferredLines[currLineNum];
                    
                    if (this.includeRectInLine(currLine, currRect.top, currRect.left, 
                                               currRect.width, currRect.height)) {
                        rectAppended = this.expandLine(currLine, currRect.left, currRect.top, 
                                                       currRect.width, currRect.height);
                        break;   
                    }
                } 
                
                if (rectAppended) {
                    continue;
                }
                // If the rect can't be added to any existing lines, create a new line
                else {
                    inferredLines.push(this.createNewLine(currRect.left, currRect.top, 
                                                          currRect.width, currRect.height));
                    // Update the number of lines, so we're not using .length on every iteration
                    numLines = numLines + 1;
                }
            }
            
            return inferredLines;
        },
        
        
        // ----------------- PRIVATE HELPERS ---------------------------------------------------------------
        
        includeRectInLine : function (currLine, rectTop, rectLeft, rectWidth, rectHeight) {
            
            // is on an existing line : based on vertical position
            if (this.rectIsWithinLineVertically(rectTop, rectHeight, currLine.maxTop, currLine.maxBottom)) {
                if (this.rectIsWithinLineHorizontally(rectLeft, rectWidth, currLine.left, 
                                                      currLine.width, currLine.avgHeight)) {
                    return true;
                }
            }
            
            return false;
        },
        
        rectIsWithinLineVertically : function (rectTop, rectHeight, currLineMaxTop, currLineMaxBottom) {
            
            var rectBottom = rectTop + rectHeight;
            var lineHeight = currLineMaxBottom - currLineMaxTop;
            var lineHeightAdjustment = (lineHeight * 0.75) / 2;
            var rectHeightAdjustment = (rectHeight * 0.75) / 2;
            
            rectTop = rectTop + rectHeightAdjustment;
            rectBottom = rectBottom - rectHeightAdjustment;
            currLineMaxTop = currLineMaxTop + lineHeightAdjustment;
            currLineMaxBottom = currLineMaxBottom - lineHeightAdjustment;
            
            if (rectTop === currLineMaxTop && rectBottom === currLineMaxBottom) {
                return true;
            }
            else if (rectTop < currLineMaxTop && rectBottom < currLineMaxBottom && rectBottom > currLineMaxTop) {
                return true;
            }
            else if (rectTop > currLineMaxTop && rectBottom > currLineMaxBottom && rectTop < currLineMaxBottom) {
                return true;
            }
            else if (rectTop > currLineMaxTop && rectBottom < currLineMaxBottom) {
                return true;
            }
            else if (rectTop < currLineMaxTop && rectBottom > currLineMaxBottom) {
                return true;
            }
            else {
                return false;
            }
        },
        
        rectIsWithinLineHorizontally : function (rectLeft, rectWidth, currLineLeft, currLineWidth, 
                                                 currLineAvgHeight) {
            
            var lineGapHeuristic = 2 * currLineAvgHeight;
            var rectRight = rectLeft + rectWidth;
            var currLineRight = rectLeft + currLineWidth;
            
            if ((currLineLeft - rectRight) > lineGapHeuristic) {
                return false;
            }
            else if ((rectLeft - currLineRight) > lineGapHeuristic) {
                return false;
            }
            else {
                return true;
            }
        },
        
        createNewLine : function (rectLeft, rectTop, rectWidth, rectHeight) {
            
            var maxBottom = rectTop + rectHeight;
            
            return {
                left : rectLeft,
                startTop : rectTop,
                width : rectWidth, 
                avgHeight : rectHeight, 
                maxTop : rectTop,
                maxBottom : maxBottom,
                numRects : 1
            };
        },
        
        expandLine : function (currLine, rectLeft, rectTop, rectWidth, rectHeight) {
            
            var lineOldRight = currLine.left + currLine.width; 
            
            // Update all the properties of the current line with rect dimensions
            var rectRight = rectLeft + rectWidth;
            var rectBottom = rectTop + rectHeight;
            var numRectsPlusOne = currLine.numRects + 1;
            
            // Average height calculation
            var currSumHeights = currLine.avgHeight * currLine.numRects;
            var avgHeight = Math.ceil((currSumHeights + rectHeight) / numRectsPlusOne);
            currLine.avgHeight = avgHeight;
            currLine.numRects = numRectsPlusOne;
            
            // Expand the line vertically
            currLine = this.expandLineVertically(currLine, rectTop, rectBottom);
            currLine = this.expandLineHorizontally(currLine, rectLeft, rectRight);        
            
            return currLine;
        },
        
        expandLineVertically : function (currLine, rectTop, rectBottom) {
            
            if (rectTop < currLine.maxTop) {
                currLine.maxTop = rectTop;
            } 
            if (rectBottom > currLine.maxBottom) {
                currLine.maxBottom = rectBottom;
            }
            
            return currLine;
        },
        
        expandLineHorizontally : function (currLine, rectLeft, rectRight) {
            
            var newLineLeft = currLine.left <= rectLeft ? currLine.left : rectLeft;
            var lineRight = currLine.left + currLine.width;
            var newLineRight = lineRight >= rectRight ? lineRight : rectRight;
            var newLineWidth = newLineRight - newLineLeft;
            
            //cancel the expansion if the line is going to expand outside a horizontal limit
            //this is used to prevent lines from spanning multiple columns in a two column epub view
            var horizontalThreshold = this.lineHorizontalThreshold;
            var horizontalLimit = this.lineHorizontalLimit;
            
            var leftBoundary = Math.floor(newLineLeft/horizontalLimit) * horizontalLimit;
            var centerBoundary = leftBoundary + horizontalThreshold;
            var rightBoundary = leftBoundary + horizontalLimit;
            if ((newLineLeft > leftBoundary && newLineRight > centerBoundary && newLineLeft < centerBoundary)
            || (newLineLeft > centerBoundary && newLineRight > rightBoundary)) {
                return undefined;
            }
            
            currLine.left = newLineLeft;
            currLine.width = newLineWidth;
            
            return currLine;
        }
    });
    
    EpubAnnotations.Highlight = Backbone.Model.extend({
        
        defaults : {
            "isVisible" : false
        },
        
        initialize : function (attributes, options) {}
    });
    
    EpubAnnotations.HighlightGroup = Backbone.Model.extend({
        
        defaults : function () {
            return {
                "selectedNodes" : [],
                "highlightViews" : []
            };
        },
        
        initialize : function (attributes, options) {
            this.set("scale", attributes.scale);
            this.constructHighlightViews();
            
        },
        
        // --------------- PRIVATE HELPERS ---------------------------------------
        
        highlightGroupCallback : function (event) {
            
            var that = this;
            var documentFrame = this.get("contentDocumentFrame");
            // Trigger this event on each of the highlight views (except triggering event)
            if (event.type === window.clickEvt) {
                that.get("bbPageSetView").trigger("annotationClicked", "highlight", that.get("CFI"), that.get("id"), event, documentFrame);
                return;
            }
            
            
            // Trigger this event on each of the highlight views (except triggering event)
            if (event.type === "contextmenu") {
                that.get("bbPageSetView").trigger("annotationRightClicked", "highlight", 
                                                  that.get("CFI"), that.get("id"), event , documentFrame);
                return;
            }
            
            if (event.type === "mouseenter") {
                that.get("bbPageSetView").trigger("annotationHoverIn", "highlight", 
                                                  that.get("CFI"), that.get("id"), event, documentFrame);
            } else if (event.type === "mouseleave") {
                that.get("bbPageSetView").trigger("annotationHoverOut", "highlight", 
                                                  that.get("CFI"), that.get("id"), event, documentFrame);
            }
            
            // Events that are called on each member of the group
            _.each(this.get("highlightViews"), function (highlightView) {
                
                if (event.type === "mouseenter") {
                    highlightView.setHoverHighlight();
                }
                else if (event.type === "mouseleave") {
                    highlightView.setBaseHighlight(false);
                }
            });
        },
        
        normalizeRectangle: function (rect) {
            return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top
            };
        },
        
        elementNodeAllowedTags: ["img"], //in lowercase
        constructHighlightViews : function () {
            
            var that = this;
            var rectTextList = [], rectElementList = [];
            var inferrer;
            var inferredLines;
            var rangeInfo = this.get("rangeInfo");
            var selectedNodes = this.get("selectedNodes");
            var contentDocumentFrame = this.get("contentDocumentFrame");
            
            if (rangeInfo && rangeInfo.startNode === rangeInfo.endNode) {
                var node = rangeInfo.startNode;
                var range = contentDocumentFrame.contentDocument.createRange();
                range.setStart(node,rangeInfo.startOffset);
                range.setEnd(node,rangeInfo.endOffset);
                
                if (node.nodeType === 3) {
                    rects = range.getClientRects();
                    
                    _.each(rects, function (rect) {
                        rectTextList.push(that.normalizeRectangle(rect));
                    });
                    selectedNodes = [];
                }
                
            }
            
            _.each(selectedNodes, function (node) {
                var range = contentDocumentFrame.contentDocument.createRange();
                if (node.nodeType === 3) {
                    var rects;
                    
                    if(rangeInfo && node === rangeInfo.startNode && rangeInfo.startOffset !== 0){
                        range.setStart(node,rangeInfo.startOffset);
                        range.setEnd(node,node.length);
                    }else if (rangeInfo && node === rangeInfo.endNode && rangeInfo.endOffset !== 0){
                        range.setStart(node,0);
                        range.setEnd(node,rangeInfo.endOffset);
                    }else{
                        range.selectNodeContents(node);
                    }
                    
                    rects = range.getClientRects();
                    
                    _.each(rects, function (rect) {
                        rectTextList.push(rect);
                    });
                } else if (node.nodeType === 1) {
                    range.selectNodeContents(node);
                    
                    if(_.contains(that.elementNodeAllowedTags, node.tagName.toLowerCase())) {
                        rectElementList.push(range.getBoundingClientRect());
                    }
                }
                
            });
            
            var scale = this.get("scale");
            var $html = $('html',contentDocumentFrame.contentDocument);
            //is there a transform scale for the content document?
            var matrix = EpubAnnotations.Helpers.getMatrix($html);
            if (!matrix && (EpubAnnotations.isIe9 || EpubAnnotations.isIe10)) {
                //if there's no transform scale then set the scale as the IE zoom factor
                scale = (window.screen.deviceXDPI / 96); //96dpi == 100% scale
            }
            
            inferrer = new EpubAnnotations.TextLineInferrer({
                lineHorizontalThreshold: $html[0].clientWidth,
                lineHorizontalLimit: contentDocumentFrame.contentWindow.innerWidth
            });
            inferredLines = inferrer.inferLines(rectTextList);
            _.each(inferredLines, function (line, index) {
                
                var highlightTop = (line.startTop + that.get("offsetTopAddition")) / scale;
                var highlightLeft = (line.left + that.get("offsetLeftAddition")) / scale;
                var highlightHeight = line.avgHeight / scale;
                var highlightWidth = line.width / scale;
                
                var highlightView = new EpubAnnotations.HighlightView({
                    highlightId: that.get('id'),
                    CFI : that.get("CFI"),
                    type: that.get("type"),
                    top : highlightTop,
                    left : highlightLeft,
                    height : highlightHeight,
                    width : highlightWidth,
                    styles : that.get('styles'),
                    highlightGroupCallback : that.highlightGroupCallback,
                    callbackContext : that
                });
                
                that.get("highlightViews").push(highlightView);
            });
            
            _.each(rectElementList, function (rect) {
                var highlightTop = (rect.top + that.get("offsetTopAddition")) / scale;
                var highlightLeft = (rect.left + that.get("offsetLeftAddition")) / scale;
                var highlightHeight = rect.height / scale;
                var highlightWidth = rect.width / scale;
                
                var highlightView = new EpubAnnotations.HighlightBorderView({
                    highlightId: that.get('id'),
                    CFI : that.get("CFI"),
                    top : highlightTop,
                    left : highlightLeft,
                    height : highlightHeight,
                    width : highlightWidth,
                    styles : that.get('styles'),
                    highlightGroupCallback : that.highlightGroupCallback,
                    callbackContext : that
                });
                
                that.get("highlightViews").push(highlightView);
            });
        },
        
        resetHighlights : function (viewportElement, offsetTop, offsetLeft) {
            
            this.set({ offsetTopAddition : offsetTop });
            this.set({ offsetLeftAddition : offsetLeft });
            this.destroyCurrentHighlights();
            this.constructHighlightViews();
            this.renderHighlights(viewportElement);
        },
        
        // REFACTORING CANDIDATE: Ensure that event listeners are being properly cleaned up. 
        destroyCurrentHighlights : function () { 
            
            _.each(this.get("highlightViews"), function (highlightView) {
                highlightView.remove();
                highlightView.off();
            });
            
            this.get("highlightViews").length = 0;
        },
        
        renderHighlights : function (viewportElement) {
            
            _.each(this.get("highlightViews"), function (view, index) {
                $(viewportElement).append(view.render());
            });
        },
        
        toInfo : function () {
            
            return {
                
                id : this.get("id"),
                type : "highlight",
                CFI : this.get("CFI")
            };
        },
        
        setStyles : function (styles) {
            var highlightViews = this.get('highlightViews');
            
            this.set({styles : styles});
            
            _.each(highlightViews, function(view, index) {
                view.setStyles(styles);
            });
        },
        
        setState : function (state, value) {
            
            var highlightViews = this.get('highlightViews');
            
            _.each(highlightViews, function(view, index) {
                if (state === "hover") {
                    if (value) {
                        view.setHoverHighlight();
                    } else {
                        view.setBaseHighlight(false);
                    }
                } else if (state === "visible") {
                    view.setVisibility(value);
                } else if (state === "focused") {
                    if (value) {
                        view.setFocusedHighlight();
                    } else {
                        view.setBaseHighlight(true);
                    }
                    
                }
            });
        }
    });
    
    EpubAnnotations.ReflowableAnnotations = Backbone.Model.extend({
        
        initialize : function (attributes, options) {
            
            this.epubCFI = EPUBcfi;
            this.annotations = new EpubAnnotations.Annotations({
                offsetTopAddition : 0,
                offsetLeftAddition : 0,
                readerBoundElement : $("html", this.get("contentDocumentDOM"))[0],
                contentDocumentFrame: this.get("contentDocumentFrame"),
                scale: 0,
                bbPageSetView : this.get("bbPageSetView")
            });
            // inject annotation CSS into iframe
            
            
            var annotationCSSUrl = this.get("annotationCSSUrl");
            if (annotationCSSUrl)
            {
                this.injectAnnotationCSS(annotationCSSUrl);
            }
            
            // emit an event when user selects some text.
            var epubWindow = this.get("contentDocumentDOM");
            var self = this;
            epubWindow.addEventListener("mouseup", function(event) {
                var range = self.getCurrentSelectionRange();
                if (range === undefined) {
                    return;
                }
                if (range.startOffset - range.endOffset) {
                    self.annotations.get("bbPageSetView").trigger("textSelectionEvent", event, range, self.get("contentDocumentFrame"));
                }
            });
            
            if(!rangy.initialized){
                rangy.init();
            }
        },
        
        // ------------------------------------------------------------------------------------ //
        //  "PUBLIC" METHODS (THE API)                                                          //
        // ------------------------------------------------------------------------------------ //
        
        redraw : function () {
            
            var leftAddition = -this.getPaginationLeftOffset();
            this.annotations.redrawAnnotations(0, leftAddition);
        },
        
        removeHighlight: function(annotationId) {
            return this.annotations.removeHighlight(annotationId)
        },
        
        normalizeRectangle: function (rect) {
            return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top
            };
        },
        
        addHighlight: function (CFI, id, type, styles) {
            
            var CFIRangeInfo;
            var range;
            var rangeStartNode;
            var rangeEndNode;
            var selectedElements;
            var leftAddition;
            
            var contentDoc = this.get("contentDocumentDOM");
            //get transform scale of content document
            var scale = 1.0;
            var matrix = EpubAnnotations.Helpers.getMatrix($('html', contentDoc));
            if (matrix) {
                scale = EpubAnnotations.Helpers.getScaleFromMatrix(matrix);
            }
            
            //create a dummy test div to determine if the browser provides
            // client rectangles that take transform scaling into consideration
            var $div = $('<div style="font-size: 50px; position: absolute; background: red; top:-9001px;">##</div>');
            $(contentDoc.documentElement).append($div);
            range = contentDoc.createRange();
            range.selectNode($div[0]);
            var renderedWidth = this.normalizeRectangle(range.getBoundingClientRect()).width;
            var clientWidth = $div[0].clientWidth;
            $div.remove();
            var renderedVsClientWidthFactor = renderedWidth / clientWidth;
            if (renderedVsClientWidthFactor === 1) {
                //browser doesn't provide scaled client rectangles (firefox)
                scale = 1;
            } else if (EpubAnnotations.isIe9 || EpubAnnotations.isIe10) {
                //use the test scale factor as our scale value for IE 9/10
                scale = renderedVsClientWidthFactor;
            }
            this.set("scale", scale);
            
            CFIRangeInfo = this.epubCFI.getRangeTargetNodes(CFI, contentDoc,
            ["cfi-marker","cfi-blacklist","mo-cfi-highlight"],
            [],
            ["MathJax_Message"]);
            var startNode = CFIRangeInfo.startNodes[0], endNode = CFIRangeInfo.endNodes[0];
            
            range = rangy.createRange(contentDoc);
            if(startNode.length< CFIRangeInfo.startOffset){
                //this is a workaround "Uncaught IndexSizeError: Index or size was negative, or greater than the allowed value." errors
                //the range cfi generator outputs a cfi like /4/2,/1:125,/16
                //can't explain, investigating..
                CFIRangeInfo.startOffset = startNode.length;
            }
            range.setStart(startNode, CFIRangeInfo.startOffset);
            range.setEnd(endNode, CFIRangeInfo.endOffset);
            
            selectedElements = range.getNodes();
            leftAddition = -this.getPaginationLeftOffset();
            
            this.annotations.set('scale', this.get('scale'));
            this.annotations.addHighlight(
                CFI, id, type, styles, selectedElements, startNode, range.startOffset, 
                endNode,range.endOffset, 0, leftAddition);
            
            return {
                CFI : CFI,
                selectedElements : selectedElements
            };
        },
        
        // this returns a partial CFI only!!
        getCurrentSelectionCFI: function() {
            var currentSelection = this.getCurrentSelectionRange();
            var CFI;
            if (currentSelection) {
                selectionInfo = this.getSelectionInfo(currentSelection);
                CFI = selectionInfo.CFI;
            }
            
            return CFI;
        },
        
        // this returns a partial CFI only!!
        getCurrentSelectionOffsetCFI: function() {
            var currentSelection = this.getCurrentSelectionRange();
            
            var CFI;
            if (currentSelection) {
                CFI = this.generateCharOffsetCFI(currentSelection);
            }
            return CFI;
        },
        
        
        /// TODODM refactor thhis using getCurrentSelectionCFI (above)
        addSelectionHighlight : function (id, type, styles) {
            
            var arbitraryPackageDocCFI = "/99!"
            var generatedContentDocCFI;
            var CFI;
            var selectionInfo;
            var currentSelection = this.getCurrentSelectionRange();
            var annotationInfo;
            
            if (currentSelection) {
                
                selectionInfo = this.getSelectionInfo(currentSelection);
                generatedContentDocCFI = selectionInfo.CFI;
                CFI = "epubcfi(" + arbitraryPackageDocCFI + generatedContentDocCFI + ")";
                annotationInfo = this.addHighlight(CFI, id, type, styles);
                
                // Rationale: The annotationInfo object returned from .addBookmark(...) contains the same value of
                //   the CFI variable in the current scope. Since this CFI variable contains a "hacked" CFI value -
                //   only the content document portion is valid - we want to replace the annotationInfo.CFI property with
                //   the partial content document CFI portion we originally generated.
                annotationInfo.CFI = generatedContentDocCFI;
                return annotationInfo;
            }
            else {
                throw new Error("Nothing selected");
            }
        },
        
        updateAnnotationView : function (id, styles) {
            
            var annotationViews = this.annotations.updateAnnotationView(id, styles);
            
            return annotationViews;
        },
        
        setAnnotationViewState : function (id, state, value) {
            
            var annotationViews = this.annotations.setAnnotationViewState(id, state, value);
            
            return annotationViews;
        },
        
        setAnnotationViewStateForAll : function (state, value) {
            
            return this.annotations.setAnnotationViewStateForAll(state, value);
        },
        
        // ------------------------------------------------------------------------------------ //
        //  "PRIVATE" HELPERS                                                                   //
        // ------------------------------------------------------------------------------------ //
        
        getSelectionInfo : function (selectedRange, elementType) {
            
            // Generate CFI for selected text
            var CFI = this.generateRangeCFI(selectedRange);
            var intervalState = {
                startElementFound : false,
                endElementFound : false
            };
            var selectedElements = [];
            
            if (!elementType) {
                var elementType = ["text"];
            }
            
            this.findSelectedElements(
            selectedRange.commonAncestorContainer,
            selectedRange.startContainer,
            selectedRange.endContainer,
            intervalState,
            selectedElements,
            elementType
            );
            
            // Return a list of selected text nodes and the CFI
            return {
                CFI : CFI,
                selectedElements : selectedElements
            };
        },
        
        generateRangeCFI : function (selectedRange) {
            
            var startNode = selectedRange.startContainer;
            var endNode = selectedRange.endContainer;
            var commonAncestor = selectedRange.commonAncestorContainer;
            var startOffset;
            var endOffset;
            var rangeCFIComponent;
            
            
            startOffset = selectedRange.startOffset;
            endOffset = selectedRange.endOffset;
            
            rangeCFIComponent = this.epubCFI.generateMixedRangeComponent(
            startNode,
            startOffset,
            endNode,
            endOffset,
            commonAncestor,
            ["cfi-marker","cfi-blacklist","mo-cfi-highlight"],
            [],
            ["MathJax_Message"]
            );
            return rangeCFIComponent;
            
        },
        
        generateCharOffsetCFI : function (selectedRange) {
            
            // Character offset
            var startNode = selectedRange.startContainer;
            var startOffset = selectedRange.startOffset;
            var charOffsetCFI;
            
            if (startNode.nodeType === Node.TEXT_NODE) {
                charOffsetCFI = this.epubCFI.generateCharacterOffsetCFIComponent(
                startNode,
                startOffset,
                ["cfi-marker","cfi-blacklist","mo-cfi-highlight"],
                [],
                ["MathJax_Message"]
                );
            }
            return charOffsetCFI;
        },
        
        // REFACTORING CANDIDATE: Convert this to jquery
        findSelectedElements : function (currElement, startElement, endElement, intervalState, selectedElements, elementTypes) {
            
            if (currElement === startElement) {
                intervalState.startElementFound = true;
            }
            
            if (intervalState.startElementFound === true) {
                this.addElement(currElement, selectedElements, elementTypes);
            }
            
            if (currElement === endElement) {
                intervalState.endElementFound = true;
                return;
            }
            
            if (currElement.firstChild) {
                this.findSelectedElements(currElement.firstChild, startElement, endElement, intervalState, selectedElements, elementTypes);
                if (intervalState.endElementFound) {
                    return;
                }
            }
            
            if (currElement.nextSibling) {
                this.findSelectedElements(currElement.nextSibling, startElement, endElement, intervalState, selectedElements, elementTypes);
                if (intervalState.endElementFound) {
                    return;
                }
            }
        },
        
        addElement : function (currElement, selectedElements, elementTypes) {
            
            // Check if the node is one of the types
            _.each(elementTypes, function (elementType) {
                
                if (elementType === "text") {
                    if (currElement.nodeType === Node.TEXT_NODE) {
                        selectedElements.push(currElement);
                    }
                }
                else {
                    if ($(currElement).is(elementType)) {
                        selectedElements.push(currElement);
                    }
                }
            });
        },
        
        // Rationale: This is a cross-browser method to get the currently selected text
        getCurrentSelectionRange : function () {
            
            var currentSelection;
            var iframeDocument = this.get("contentDocumentDOM");
            if (iframeDocument.getSelection) {
                
                currentSelection = iframeDocument.getSelection();
                if ( ! currentSelection || currentSelection.rangeCount === 0) {
                    console.info(">> currentSelection is undef!");
                    return undefined;
                }
                
                var range =  currentSelection.getRangeAt(0);
                
                if (range.toString() !== '') {
                    //if (currentSelection && currentSelection.rangeCount && (currentSelection.anchorOffset !== currentSelection.focusOffset)) {
                        return range;
                    } else {
                        return undefined;
                    }
                }
                else if (iframeDocument.selection) {
                    return iframeDocument.selection.createRange();
                }
                else {
                    return undefined;
                }
            },
            
            getPaginationLeftOffset : function () {
                
                var $htmlElement = $("html", this.get("contentDocumentDOM"));
                if (!$htmlElement || !$htmlElement.length) {
                    // if there is no html element, we might be dealing with a fxl with a svg spine item
                    return 0;
                }
                var offsetLeftPixels = $htmlElement.css("left");
                var offsetLeft = parseInt(offsetLeftPixels.replace("px", ""));
                if(isNaN(offsetLeft)){
                    //for fixed layouts, $htmlElement.css("left") has no numerical value
                    offsetLeft = 0;
                }
                return offsetLeft;
            },
            
            getRangeStartMarker : function (CFI, id) {
                
                return "<span class='range-start-marker cfi-marker' id='start-" + id + "' data-cfi='" + CFI + "'></span>";
            },
            
            getRangeEndMarker : function (CFI, id) {
                
                return "<span class='range-end-marker cfi-marker' id='end-" + id + "' data-cfi='" + CFI + "'></span>";
            },
            
            injectAnnotationCSS : function (annotationCSSUrl) {
                
                var $contentDocHead = $("head", this.get("contentDocumentDOM"));
                $contentDocHead.append(
                $("<link/>", { rel : "stylesheet", href : annotationCSSUrl, type : "text/css" })
                );
            }
        });
        
        EpubAnnotations.Annotations = Backbone.Model.extend({
            
            defaults : function () {
                return {
                    "highlights" : [],
                    "annotationHash" : {},
                    "offsetTopAddition" : 0,
                    "offsetLeftAddition" : 0,
                    "readerBoundElement" : undefined
                };
            },
            
            initialize : function (attributes, options) {},
            
            remove: function() {
                var that = this;
                _.each(this.get("highlights"), function (highlightGroup) {
                    highlightGroup.remove();
                });
            },
            
            redrawAnnotations : function (offsetTop, offsetLeft) {
                
                var that = this;
                // Highlights
                _.each(this.get("highlights"), function (highlightGroup) {
                    highlightGroup.resetHighlights(that.get("readerBoundElement"), offsetTop, offsetLeft);
                });
            },
            
            getHighlight : function (id) {
                
                var highlight = this.get("annotationHash")[id];
                if (highlight) {
                    return highlight.toInfo();
                }
                else {
                    return undefined;
                }
            },
            
            getHighlights : function () {
                
                var highlights = [];
                _.each(this.get("highlights"), function (highlight) {
                    
                    highlights.push(highlight.toInfo());
                });
                return highlights;
            },
            
            removeHighlight: function(annotationId) {
                var annotationHash = this.get("annotationHash");
                var highlights = this.get("highlights");
                
                delete annotationHash[annotationId];
                
                highlights = _.reject(highlights,
                function(obj) {
                    if (obj.id == annotationId) {
                        obj.destroyCurrentHighlights();
                        return true;
                    } else {
                        return false;
                    }
                }
                );
                
                
                this.set("highlights", highlights);
            },
            
            addHighlight: function (CFI, annotationId, type, styles, highlightedNodes, 
                                    startNode, startOffset, endNode, endOffset,  offsetTop, offsetLeft) {
                if (!offsetTop) {
                    offsetTop = this.get("offsetTopAddition");
                }
                if (!offsetLeft) {
                    offsetLeft = this.get("offsetLeftAddition");
                }
                
                annotationId = annotationId.toString();
                this.validateAnnotationId(annotationId);
                
                var highlightGroup = new EpubAnnotations.HighlightGroup({
                    CFI : CFI,
                    selectedNodes : highlightedNodes,
                    offsetTopAddition : offsetTop,
                    offsetLeftAddition : offsetLeft,
                    styles: styles,
                    id : annotationId,
                    type: type,
                    bbPageSetView : this.get("bbPageSetView"),
                    scale: this.get("scale"),
                    contentDocumentFrame: this.get("contentDocumentFrame"),
                    rangeInfo: {
                        startNode: startNode,
                        startOffset: startOffset,
                        endNode: endNode,
                        endOffset: endOffset
                    }
                });
                this.get("annotationHash")[annotationId] = highlightGroup;
                this.get("highlights").push(highlightGroup);
                highlightGroup.renderHighlights(this.get("readerBoundElement"));
            },
            
            updateAnnotationView : function (id, styles) {
                var annotationViews = this.get("annotationHash")[id];
                
                if (annotationViews) {
                    annotationViews.setStyles(styles);
                }
                
                return annotationViews;
            },
            
            setAnnotationViewState : function (id, state, value){
                
                var annotationViews = this.get("annotationHash")[id];
                
                if (annotationViews) {
                    annotationViews.setState(state,value);
                }
                
                return annotationViews;
            },
            
            setAnnotationViewStateForAll : function (state,value){
                var annotationViews = this.get("annotationHash");
                _.each(annotationViews,function(annotationView){
                    annotationView.setState(state,value);
                });
            },
            
            // REFACTORING CANDIDATE: Some kind of hash lookup would be more efficient here, might want to 
            //   change the implementation of the annotations as an array
            validateAnnotationId : function (id) {
                
                if (this.get("annotationHash")[id]) {
                    throw new Error("That annotation id already exists; annotation not added");
                }
            }
        });
        
        EpubAnnotations.HighlightView = Backbone.View.extend({
            
            el : "<div class=\"highlight\"></div>",
            
            events : {
                "mouseenter" : "highlightEvent",
                "mouseleave" : "highlightEvent",
                "click" : "highlightEvent",
                "touchstart" : "highlightEvent",
                "contextmenu" : "highlightEvent"
            },
            
            initialize : function (options) {
                this.$el.attr('data-id',options.highlightId);
                this.highlight = new EpubAnnotations.Highlight({
                    CFI : options.CFI,
                    type : options.type,
                    top : options.top,
                    left : options.left,
                    height : options.height,
                    width : options.width,
                    styles: options.styles,
                    highlightGroupCallback : options.highlightGroupCallback,
                    callbackContext : options.callbackContext
                });
                
                this.swipeThreshold = 10;
                this.swipeVelocity = 0.65; // in px/ms
            },
            
            render : function () {
                
                this.setCSS();
                return this.el;
            },
            
            resetPosition : function (top, left, height, width) {
                this.highlight.set({
                    top : top,
                    left : left,
                    height : height,
                    width : width
                });
                this.setCSS();
            },
            
            setStyles : function (styles) {
                
                this.highlight.set({
                    styles : styles
                });
                this.render();
            },
            
            setCSS : function () {
                
                var styles = this.highlight.get("styles") || {};
                
                this.$el.css({
                    "position" : "absolute",
                    "top" : this.highlight.get("top") + "px",
                    "left" : this.highlight.get("left") + "px",
                    "height" : this.highlight.get("height") + "px",
                    "width" : this.highlight.get("width") + "px"
                });
                
                try {
                    this.$el.css(styles);
                } catch(ex) {
                    console.log('EpubAnnotations: invalid css styles');
                }
            },
            
            setBaseHighlight : function (removeFocus) {
                this.$el.addClass("highlight");
                this.$el.removeClass("hover-highlight");
                if (removeFocus) {
                    this.$el.removeClass('focused-highlight');
                }
            },
            
            setHoverHighlight : function () {
                
                this.$el.addClass("hover-highlight");
                this.$el.removeClass("highlight");
            },
            
            setFocusedHighlight: function () {
                this.$el.addClass("focused-highlight");
                this.$el.removeClass("highlight").removeClass('hover-highlight');
            },
            
            setVisibility: function(value){
                if (value) {
                    this.$el.css('display','');
                } else {
                    this.$el.css('display','none');
                }
            },
            
            highlightEvent : function (event) {
                var that = this;
                // console.info('>> works?', 'ontouchstart' in document.documentElement, event.type === 'click');
                if ('ontouchstart' in document.documentElement && event.type === 'click') {
                    // console.info('>> event is ignored.');
                    return;
                }
                
                var highlightGroupContext = that.highlight.get("callbackContext");
                var $document = $(contentDocumentFrame.contentDocument);
                
                //we call highlightGroupCallback on touchend if and only if the touch gesture was not a swipe
                if (event.type === 'touchstart') {
                    var pointer = event.originalEvent.targetTouches[0];
                    var startingX = pointer.pageX;
                    var startingTime = Date.now();
                    var totalX = 0;
                    //we bind on the body element, to ensure that the touchend event is caught, or else we 
                    var namespace = '.highlightEvent';
                    
                    $document.on('touchmove' + namespace, function (moveEvent) {
                        var moveEventPointer = moveEvent.originalEvent.targetTouches[0];
                        totalX += Math.abs(moveEventPointer.pageX - startingX);
                    });
                    
                    $document.on('touchend' + namespace, function (endEvent) {
                        $document.off('touchmove' + namespace).off('touchend' + namespace);
                        var endEventPointer = endEvent.originalEvent.targetTouches[0];
                        var elapsedTime = Date.now() - startingTime;
                        var pastThreshold = totalX > that.swipeThreshold;
                        var velocity = (totalX / elapsedTime);
                        var isSwipe = pastThreshold || ( velocity >= that.swipeVelocity);
                        
                        //check totalDistance moved, or swipe velocity
                        if (!isSwipe) {
                            endEvent.stopPropagation();
                            highlightGroupContext.highlightGroupCallback(event);
                        }
                    });
                } else {
                    event.stopPropagation();
                    highlightGroupContext.highlightGroupCallback(event);
                }
            }
        });
        
        var reflowableAnnotations = new EpubAnnotations.ReflowableAnnotations({
            contentDocumentDOM : contentDocumentFrame.contentDocument,
            contentDocumentFrame: contentDocumentFrame,
            bbPageSetView : bbPageSetView,
            annotationCSSUrl : annotationCSSUrl,
        });
        
        // Description: The public interface
        return {
            
            addSelectionHighlight : function (id, type, styles) { 
                return reflowableAnnotations.addSelectionHighlight(id, type, styles); 
            },
            addHighlight : function (CFI, id, type, styles) { 
                return reflowableAnnotations.addHighlight(CFI, id, type, styles); 
            },
            updateAnnotationView : function (id, styles) {
                return reflowableAnnotations.updateAnnotationView(id, styles);
            },
            setAnnotationViewState : function (id, state, value) {
                return reflowableAnnotations.setAnnotationViewState(id, state, value);
            },
            setAnnotationViewStateForAll : function (state, value) {
                return reflowableAnnotations.setAnnotationViewStateForAll(state, value);
            },
            redraw : function () { 
                return reflowableAnnotations.redraw(); 
            },
            getHighlight : function (id) { 
                return reflowableAnnotations.annotations.getHighlight(id); 
            },
            getHighlights : function () { 
                return reflowableAnnotations.annotations.getHighlights(); 
            },
            getCurrentSelectionCFI: function () {
                return reflowableAnnotations.getCurrentSelectionCFI();
            },
            getCurrentSelectionOffsetCFI: function () {
                return reflowableAnnotations.getCurrentSelectionOffsetCFI();
            },
            removeHighlight: function (annotationId) {
                return reflowableAnnotations.removeHighlight(annotationId);
            }
        };
    };
    
