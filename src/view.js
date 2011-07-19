/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

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
        this.widget.destroy();
    },

    setModel: function(model) {
        this.model = model;
        this.widget.set_model(model);

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
            log('Unable to open ' + uri + ': ' + e.toString());
        }
    }
}
