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

const Gdk = imports.gi.Gdk;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Embed = imports.embed;
const Global = imports.global;
const Sidebar = imports.sidebar;
const WindowMode = imports.windowMode;

const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 768;
const _WINDOW_DEFAULT_HEIGHT = 600;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       title: _("Documents") });

        Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.maximize();
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));
        this.window.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));

        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.window.add(this._grid);

        this._sidebar = new Sidebar.Sidebar();
        this._grid.add(this._sidebar.widget);

        this._embed = new Embed.ViewEmbed();
        this._grid.add(this._embed.widget);

        this._grid.show_all();
    },

    _onFullscreenChanged: function(controller, fullscreen) {
        if (fullscreen)
            this.window.fullscreen();
        else
            this.window.unfullscreen();
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];
        let state = event.get_state()[1];

        if ((keyval == Gdk.KEY_q) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            Global.application.quit();
            return true;
        }

        if (Global.modeController.getWindowMode() == WindowMode.WindowMode.PREVIEW)
            return this._handleKeyPreview(keyval, state);
        else
            return this._handleKeyOverview(keyval, state);
    },

    _handleKeyPreview: function(keyval, state) {
        let fullscreen = Global.modeController.getFullscreen();

        if (keyval == Gdk.KEY_f) {
            Global.modeController.toggleFullscreen();
            return true;
        }

        if (keyval == Gdk.KEY_Escape && fullscreen) {
            Global.modeController.setFullscreen(false);
            return true;
        }

        if (keyval == Gdk.KEY_Escape ||
            keyval == Gdk.KEY_Back) {
            Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
            return true;
        }

        return false;
    },

    _handleKeyOverview: function(keyval, state) {
        if (((keyval == Gdk.KEY_f) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) ||
            ((keyval == Gdk.KEY_s) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0))) {
            Global.focusController.requestSearch();
            return true;
        }

        return false;
    },

    _onDeleteEvent: function() {
        Global.application.quit();
    }
};
