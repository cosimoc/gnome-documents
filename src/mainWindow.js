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

const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Embed = imports.embed;
const Global = imports.global;
const Searchbar = imports.searchbar;
const Selections = imports.selections;
const Sidebar = imports.sidebar;
const Utils = imports.utils;
const WindowMode = imports.windowMode;

const _ = imports.gettext.gettext;

const _CONFIGURE_ID_TIMEOUT = 100; // msecs
const _OSD_TOOLBAR_SPACING = 60;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._configureId = 0;

        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       title: _("Documents") });
        this._clutterEmbed = new GtkClutter.Embed();
        this.window.add(this._clutterEmbed);
        this._clutterEmbed.show();

        Global.stage = this._clutterEmbed.get_stage();

        Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);

        // apply the last saved window size and position
        let size = Global.settings.get_value('window-size');
        if (size.n_children() == 2) {
            let width = size.get_child_value(0);
            let height = size.get_child_value(1);

            this.window.set_default_size(width.get_int32(),
                                         height.get_int32());
        }

        let position = Global.settings.get_value('window-position');
        if (position.n_children() == 2) {
            let x = position.get_child_value(0);
            let y = position.get_child_value(1);

            this.window.move(x.get_int32(),
                             y.get_int32());
        }

        if (Global.settings.get_boolean('window-maximized'))
            this.window.maximize();

        this.window.connect('delete-event',
                            Lang.bind(this, this._quit));
        this.window.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
        this.window.connect('configure-event',
                            Lang.bind(this, this._onConfigureEvent));
        this.window.connect('window-state-event',
                            Lang.bind(this, this._onWindowStateEvent));

        Global.modeController.connect('fullscreen-changed',
                                      Lang.bind(this, this._onFullscreenChanged));

        // the base layout is a vertical ClutterBox
        this._clutterBoxLayout = new Clutter.BoxLayout({ vertical: true });
        this._clutterBox = new Clutter.Box({ layout_manager: this._clutterBoxLayout });
        this._clutterBox.add_constraint(
            new Clutter.BindConstraint({ coordinate: Clutter.BindCoordinate.SIZE,
                                         source: Global.stage }));

        Global.stage.add_actor(this._clutterBox);

        // first child: searchbar filling the X axis
        this._searchbar = new Searchbar.Searchbar();
        this._clutterBox.add_actor(this._searchbar.actor);
        this._clutterBoxLayout.set_fill(this._searchbar.actor, true, false);

        // second child: an horizontal layout box which will
        // contain the sidebar and the embed
        this._horizLayout = new Clutter.BoxLayout();
        this._horizBox = new Clutter.Box({ layout_manager: this._horizLayout });
        this._clutterBox.add_actor(this._horizBox);
        this._clutterBoxLayout.set_expand(this._horizBox, true);
        this._clutterBoxLayout.set_fill(this._horizBox, true, true);

        // create the sidebar and pack it as a first child into the
        // horizontal box
        this._sidebar = new Sidebar.Sidebar();
        this._horizBox.add_actor(this._sidebar.actor);
        this._horizLayout.set_fill(this._sidebar.actor, false, true);

        // create the embed and pack it as the second child into
        // the horizontal box
        this._embed = new Embed.ViewEmbed();
        this._horizBox.add_actor(this._embed.actor);
        this._horizLayout.set_expand(this._embed.actor, true);
        this._horizLayout.set_fill(this._embed.actor, true, true);

        // create the dropdown for the search bar, it's hidden by default
        this._dropdownBox = new Searchbar.Dropdown();
        this._dropdownBox.actor.add_constraint(
            new Clutter.BindConstraint({ source: this._horizBox,
                                         coordinate: Clutter.BindCoordinate.Y }));
        this._dropdownBox.actor.add_constraint(
            new Clutter.AlignConstraint({ source: this._horizBox,
                                          align_axis: Clutter.AlignAxis.X_AXIS,
                                          factor: 0.50 }));
        Global.stage.add_actor(this._dropdownBox.actor);

        // create the OSD toolbar for selected items, it's hidden by default
        this._selectionToolbar = new Selections.SelectionToolbar();
        this._selectionToolbar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.X_AXIS,
                                          source: this._embed.actor,
                                          factor: 0.50 }));
        let yConstraint =
            new Clutter.BindConstraint({ source: this._embed.actor,
                                         coordinate: Clutter.BindCoordinate.Y,
                                         offset: this._embed.actor.height - _OSD_TOOLBAR_SPACING });
        this._selectionToolbar.actor.add_constraint(yConstraint);

        // refresh the constraint offset when the height of the embed actor changes
        this._embed.actor.connect("notify::height", Lang.bind(this,
            function() {
                yConstraint.set_offset(this._embed.actor.height - _OSD_TOOLBAR_SPACING);
            }));

        Global.stage.add_actor(this._selectionToolbar.actor);
    },

    _saveWindowGeometry: function() {
        let window = this.window.get_window();
        let state = window.get_state();

        if (state & Gdk.WindowState.MAXIMIZED)
            return;

        // GLib.Variant.new() can handle arrays just fine
        let size = this.window.get_size();
        let variant = GLib.Variant.new ('ai', size);
        Global.settings.set_value('window-size', variant);

        let position = this.window.get_position();
        variant = GLib.Variant.new ('ai', position);
        Global.settings.set_value('window-position', variant);
    },

    _onConfigureEvent: function(widget, event) {
        if (Global.modeController.getFullscreen())
            return;

        if (this._configureId != 0) {
            Mainloop.source_remove(this._configureId);
            this._configureId = 0;
        }

        this._configureId = Mainloop.timeout_add(_CONFIGURE_ID_TIMEOUT, Lang.bind(this,
            function() {
                this._saveWindowGeometry();
                return false;
            }));
    },

    _onWindowStateEvent: function(widget, event) {
        let window = widget.get_window();
        let state = window.get_state();

        if (state & Gdk.WindowState.FULLSCREEN)
            return;

        let maximized = (state & Gdk.WindowState.MAXIMIZED);
        Global.settings.set_boolean('window-maximized', maximized);
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
            this._quit();
            return true;
        }

        if (Global.modeController.getWindowMode() == WindowMode.WindowMode.PREVIEW)
            return this._handleKeyPreview(event);
        else
            return this._handleKeyOverview(event);
    },

    _handleKeyPreview: function(event) {
        let keyval = event.get_keyval()[1];
        let state = event.get_state()[1];
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

    _handleKeyOverview: function(event) {
        let keyval = event.get_keyval()[1];

        if (keyval == Gdk.KEY_F9) {
            let visible = Global.sidebarController.getSidebarVisible();
            Global.sidebarController.setSidebarVisible(!visible);
            return true;
        }

        if (Utils.isSearchEvent(event)) {
            let visible = Global.searchController.getSearchVisible();
            Global.searchController.setSearchVisible(!visible);
            return true;
        }

        if (!Global.searchController.getSearchIn()) {
            Global.searchController.deliverEvent(event);
            return Global.searchController.getEventHandled();
        }

        return false;
    },

    _quit: function() {
        // remove configure event handler if still there
        if (this._configureId != 0) {
            Mainloop.source_remove(this._configureId);
            this._configureId = 0;
        }

        // always save geometry before quitting
        this._saveWindowGeometry();

        Global.application.quit();
    }
};
