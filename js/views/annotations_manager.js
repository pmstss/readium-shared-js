//  Created by Dmitry Markushevich (dmitrym@evidentpoint.com)
//
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

/*

# Highlighting in Readium - A primer

Please note:

- only simple text highlighting is currently supported
- it's the job of the reading system to keep track of annotations. readium-js simply displays your annotations.
- full CFIs for annotations are not currently available. We use so called "partial CFI"s, a tuple containing idref of the spine item 
  and the CFI definition relative to the root of the spine item.

Currently, the API exposed via `ReaderView` exposes 4 functions and 1 event which should be sufficient for a simple highlighting workflow.

# API

For the purposes of the examples below, `RReader` is a previously instantiated `ReaderView` instance.

## Is anything selected (getCurrentSelectionCfi())

Before proceeding with the highlighting workflow it is sometimes necessary to determine whether the user has in fact selected anything. 
This can be accomplished with the following:

	> RReader.getCurrentSelectionCfi()
        ReadiumSDK.Models.BookmarkData {idref: "id-id2635343", contentCFI: "/4/2[building_a_better_epub]/10,/4/1:12,/6/1:429", toString: function}

The response contains a partial CFI that is sufficient to create a highlight based on selection. If nothing is selected *undefined* is returned.

You can also use partial Cfi with `openSpineItemElementCfi()` to navigate to where this selection is later.

## Highlighting (addHighlight and addSelectionHighlight)

Once we've determined what needs to be highlighted (by generating a partial CFI from a selection, or having an existing partial CFI stored externally) 
we can add it to the reader by calling `addHighlight()`:

	> RReader.addHighlight('id-id2604743', "/4/2/6,/1:74,/1:129", 123, "highlight")
	Object {CFI: "/4/2/6,/1:74,/1:129", selectedElements: Array[1], idref: "id-id2604743"}

*addHighligh*t takes the following parameters:

- *id-id2604743* - `idref` is the idref value from `getCurrentSelectionCfi()
- * /4/2/6,/1:74,/1:129* - `cfi` is the cfi value from `getCurrentSelectionCfi()
- *123* - `id` is the unique id that defines this annotation
- *highlight* - 'type' of annotation.

### addSelectioHighlight

Alternatively, you can call addSelectionHighlight(). It combines both getCurrentSelectionCfi() and addHighlight into one call:

	> RReader.addSelectionHighlight(124, "highlight")
	Object {CFI: "/4/2/4,/1:437,/1:503", selectedElements: Array[1], idref: "id-id2604743"}

Note that it provides no validation. If nothing is selected, `undefined` is returned.


## Removing highlights

To remove the highlight, call `removeHighlight`:

	> RReader.removeHighlight(123)
	undefined


# Handling annotation click events

When a user clicks on a highlight `annotationClicked` event is dispatched with the following arguments:

- type of annotation
- idref of the spine item
- partial Cfi of the annotation
- annotationdId


	> RReader.on('annotationClicked', function(type, idref, cfi, annotationId) { console.log (type, idref, cfi, annotationId)});
	ReadiumSDK.Views.ReaderView {on: function, once: function, off: function, trigger: function, listenTo: function???}

Then when the user clicks on the highlight the following will show up in the console:

	highlight id-id2604743 /4/2/6,/1:74,/1:129 123

Note that there are 2 more events that may be hadled in a similar manner - 'textSelection' and 'imgDblClicked'. 
The set of arguments passed to the event handling function is different though.

*/

ReadiumSDK.Views.AnnotationsManager = function (proxyObj, options) {

    var self = this;
    var liveAnnotations = {};
    var spines = {};
    var proxy = proxyObj;
    var annotationCSSUrl = options.annotationCSSUrl;

    if (!annotationCSSUrl) {
        console.warn("WARNING! Annotations CSS not supplied. Highlighting is not going to work.");
    }

    // mix in Backbone Events to allow for named event handling
    _.extend(self, Backbone.Events);

    // we want to bubble up all of the events that annotations module may trigger up.
    // Note that annotations module produces "annotation" related events (triggered on HighlightViews of HighlightGroup):
    // that are mangled, i.e., a new set of arguments is produced in mangleEvent function
    // as well as these 2 events:  "textSelectionEvent" and "imgDblClicked", that are not mangled and propogated "as is"
    this.on("all", function(eventName) {
        var args = Array.prototype.slice.call(arguments);
        // mangle annotationClicked event. What really needs to happen is, the annotation_module needs to return a
        // bare Cfi, and this class should append the idref.
        var mangleEvent = function(annotationEvent){
            if (args.length && args[0] === annotationEvent) {
                for (var spineIndex in liveAnnotations)
                {
                    var contentDocumentFrame = args[5];
                    var jQueryEvent = args[4];
                    if (typeof jQueryEvent.clientX === 'undefined') {
                        jQueryEvent.clientX = jQueryEvent.pageX;
                        jQueryEvent.clientY = jQueryEvent.pageY;
                    }

                    var annotationId = args[3];
                    var partialCfi = args[2];
                    var type = args[1];
                    if (liveAnnotations[spineIndex].getHighlight(annotationId)) {
                        var idref = spines[spineIndex].idref;
                        args = [annotationEvent, type, idref, partialCfi, annotationId, jQueryEvent, contentDocumentFrame];
                    }
                }
            }
        }
        mangleEvent('annotationClicked');
        mangleEvent('annotationTouched');
        mangleEvent('annotationRightClicked');
        mangleEvent('annotationHoverIn');
        mangleEvent('annotationHoverOut');
        self['trigger'].apply(proxy, args);
    });

    this.attachAnnotations = function($iframe, spineItem, loadedSpineItems) {
        var epubDocumentFrame = $iframe[0];
        liveAnnotations[spineItem.index] = new EpubAnnotationsModule(epubDocumentFrame, self, annotationCSSUrl);
        spines[spineItem.index] = spineItem;

        // check to see which spine indicies can be culled depending on the currently loaded spine items
        for(var spineIndex in liveAnnotations) {
            if (liveAnnotations.hasOwnProperty(spineIndex) && !_.contains(loadedSpineItems, spines[spineIndex])) {
                delete liveAnnotations[spineIndex];
            }
        }
    };


    this.getCurrentSelectionCfi = function() {
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            var partialCfi = annotationsForView.getCurrentSelectionCFI();
            if (partialCfi) {
                return new ReadiumSDK.Models.BookmarkData(spines[spine].idref, partialCfi);
            }
        }
        return undefined;
    };

    this.addSelectionHighlight = function(id, type, styles) {
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            if (annotationsForView.getCurrentSelectionCFI()) {
                var annotation = annotationsForView.addSelectionHighlight(id, type, styles);
                annotation.idref = spines[spine].idref;
                return new ReadiumSDK.Models.BookmarkData(annotation.idref, annotation.CFI);
            }
        }
        return undefined;
    };

    this.addHighlight = function(spineIdRef, partialCfi, id, type, styles) {
        for(var spine in liveAnnotations) {
            if (spines[spine].idref === spineIdRef) {
                var annotationsForView = liveAnnotations[spine];
                var annotation = annotationsForView.addHighlight(partialCfi, id, type, styles);
                if (annotation) {
                    annotation.idref = spineIdRef;
                    return new ReadiumSDK.Models.BookmarkData(annotation.idref, annotation.CFI);
                }
            }
        }
        return undefined;
    };

    this.removeHighlight = function(id) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result  = annotationsForView.removeHighlight(id);
        }
        return result;
    };

    this.removeHighlightsByType = function(type) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result  = annotationsForView.removeHighlightsByType(type);
        }
        return result;
    };

    this.getHighlight = function(id) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result  = annotationsForView.getHighlight(id);
        }
        return result;
    };

    this.redrawAnnotations = function(){
        for(var spine in liveAnnotations){
            liveAnnotations[spine].redraw();
        }
    };

    this.updateAnnotationView = function(id, styles) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result = annotationsForView.updateAnnotationView(id,styles);
            if(result){
                break;
            }
        }
        return result;
    };

    this.setAnnotationViewState = function(id, state, value) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result = annotationsForView.setAnnotationViewState(id, state, value);
            if(result){
                break;
            }
        }
        return result;
    };

    this.setAnnotationViewStateForAll = function(state, value) {
        var result = undefined;
        for(var spine in liveAnnotations) {
            var annotationsForView = liveAnnotations[spine];
            result = annotationsForView.setAnnotationViewStateForAll(state, value);
            if(result){
                break;
            }
        }
        return result;
    };

    this.getAnnotationMidpoints = function($elementSpineItemCollection){
        var output = [];

        _.each($elementSpineItemCollection, function (item){
            var annotations = [];

            var lastId = null;
            _.each(item.elements, function(element){

                var $element;
                //TODO JC: yuck, we get two different collection structures from non fixed and fixed views.. must refactor..
                if(element.element){
                    $element = $(element.element);
                    element = element.element;
                }else{
                    $element = $(element);
                    element = element[0];
                }
                var elementId = $element.attr('data-id');

                if(!elementId){
                    console.warn('AnnotationsManager:getAnnotationMidpoints: Got an annotation element with no ID??')
                    return;
                }
                if (elementId === lastId) return;
                lastId = elementId;

                //calculate position offsets with scaling
                var scale = 1;
                //figure out a better way to get the html parent from an element..
                var $html = $element.parent();
                //get transformation scale from content document
                var matrix = ReadiumSDK.Helpers.CSSTransformMatrix.getMatrix($html);
                if (matrix) {
                    scale = ReadiumSDK.Helpers.CSSTransformMatrix.getScaleFromMatrix(matrix);
                }
                var offset = $element.offset();
                var position = offset;
                if(scale !== 1){
                    position = {top: (offset.top * scale)*(1/scale)-12, left: offset.left }; //the 12 is a "padding"
                }
                var $highlighted = {id: elementId, position: position, lineHeight: parseInt($element.css('line-height'),10)};
                annotations.push($highlighted)
            });

            output.push({annotations:annotations, spineItem: item.spineItem});
        });

        return output;
    };

    this.getAnnotationsElementSelector = function () {
        return 'div.highlight';
    };
};
