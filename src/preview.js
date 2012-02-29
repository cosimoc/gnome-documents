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

const EvView = imports.gi.EvinceView;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

const Global = imports.global;
const View = imports.view;

function PreviewView(model) {
    this._init(model);
}

PreviewView.prototype = {
    _init: function(model) {
        this._model = model;

        this.widget = EvView.View.new();
        this.widget.set_model(this._model);
        this.widget.show();

        this.widget.connect('button-press-event',
                            Lang.bind(this, this._onButtonPressEvent));
        this.widget.connect('button-release-event',
                            Lang.bind(this, this._onButtonReleaseEvent));
        this.widget.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];

        if (keyval == Gdk.KEY_space) {
            this.widget.scroll(Gtk.ScrollType.PAGE_FORWARD, false);
            return true;
        }

        return false;
     },

    _onButtonReleaseEvent: function(widget, event) {
        let button = event.get_button()[1];
        let timestamp = event.get_time();

        if (button != 3)
            return false;

        let doc = Global.documentManager.getActiveItem();
        let menu = new View.ContextMenu([ doc.id ]);

        menu.widget.popup(null, null, null, null, null, null, button, timestamp);

        return true;
    },

    _onButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        let clickCount = event.get_click_count()[1];

        if (button == 1 && clickCount == 2) {
            Global.modeController.toggleFullscreen();
            return true;
        }

        return false;
    },

    destroy: function() {
        this.widget.destroy();
    }
};
