const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

const Main = imports.main;
const TrackerModel = imports.trackerModel;

function View(window) {
    this._init(window);
}

View.prototype = {
    _init: function(window) {
        this.window = window;
    },

    destroy: function() {
        this.view.destroy();
    },

    setModel: function(model) {
        this.model = model;
        this.view.set_model(model);

        this.createRenderers();
    },

    // this must be overridden by all implementations
    createRenderers: function() {
        throw new Error('Missing implementation of createRenderers in ' + this);
    },

    activateItem: function(path) {
        let iter = this.model.get_iter(path)[1];
        let uri = this.model.get_value(iter, TrackerModel.ModelColumns.URI);

        try {
            Gtk.show_uri(null, uri, Gtk.get_current_event_time());
        } catch (e) {
            log('Unable to open ' + uri + ': ' + e.toString())
        }
    }
}
