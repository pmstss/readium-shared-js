define(['readium_shared_js/plugins_controller', 'jquery', 'hammer', 'jquery_hammer'], function(Plugins, $, Hammer, jqueryHammer) {
    Plugins.register("gestures", function(api) {
        var that = this;
        var reader = api.reader;
        var hammerOptions = {
            stop_browser_behavior: false,
            prevent_mouseevents: true
        };

        this.init = function() {

            reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function(iframe, s) {
                //set hammer's document root
                Hammer.DOCUMENT = iframe[0].contentDocument.documentElement;
                //hammer's internal touch events need to be redefined? (doesn't work without)
                Hammer.event.onTouch(Hammer.DOCUMENT, Hammer.EVENT_MOVE, Hammer.detection.detect);
                Hammer.event.onTouch(Hammer.DOCUMENT, Hammer.EVENT_END, Hammer.detection.detect);
                //delete Hammer.defaults.stop_browser_behavior.userSelect;
                //set up the hammer gesture events

                //swiping handlers
                Hammer(Hammer.DOCUMENT, hammerOptions).on("swipeleft.Hammer", function(e) {
                    $('input').first().focus();
                    reader.trigger('swipeleft', e);
                });
                Hammer(Hammer.DOCUMENT, hammerOptions).on("swiperight.Hammer", function(e) {
                    $('input').first().focus();
                    reader.trigger('swiperight', e);
                });

                //touch handlers
                Hammer(Hammer.DOCUMENT, hammerOptions).on("tap.Hammer", function(e) {
                    reader.trigger('tap', e);
                });
                Hammer(Hammer.DOCUMENT, hammerOptions).on("doubletap.Hammer", function(e) {
                    reader.trigger('doubletap', e);
                });
                Hammer(Hammer.DOCUMENT, hammerOptions).on("hold.Hammer", function(e) {
                    reader.trigger('hold', e);
                });

                //remove stupid ipad safari elastic scrolling
                //TODO: test this with reader ScrollView and FixedView
                $(Hammer.DOCUMENT).on(
                    'touchmove.Hammer',
                    function(e) {
                        //hack: check if we are not dealing with a scrollview
                        if (iframe.height() <= iframe.parent().height()) {
                            e.preventDefault();
                        }
                    }
                );
            });
        };

        this.bindToViewport = function($viewport) {
            //swiping handlers
            $viewport.hammer(hammerOptions).on("swipeleft.Hammer", function(e) {
                reader.trigger('swipeleft', e);

            });
            $viewport.hammer(hammerOptions).on("swiperight.Hammer", function(e) {
                reader.trigger('swiperight', e);

            });

            //touch handlers
            //            $viewport.hammer(hammerOptions).on("tap.Hammer", function (e) {
            //                reader.trigger('tap', e);
            //            });
            //            $viewport.hammer(hammerOptions).on("doubletap.Hammer", function (e) {
            //                reader.trigger('doubletap', e);
            //            });
            //            $viewport.hammer(hammerOptions).on("hold.Hammer", function (e) {
            //                reader.trigger('hold', e);
            //            });

            //remove stupid ipad safari elastic scrolling (improves UX for gestures)
            //TODO: test this with reader ScrollView and FixedView
            $viewport.on(
                'touchmove.Hammer',
                function(e) {
                    e.preventDefault();
                }
            );
        };

        this.init();
    });
});
