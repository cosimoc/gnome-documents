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

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._initGtkToolbar();
    },

    _initGtkToolbar: function() {
        this.widget = new Gtk.Toolbar({ hexpand: true,
                                        icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class('primary-toolbar');
    },

    _clearToolbar: function() {
        this.widget.foreach(Lang.bind(this, function(widget) {
            widget.destroy();
        }));
    },

    _populateForOverview: function() {
        let iconView = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'view-grid-symbolic',
                                                                     pixel_size: 16 }) });
        iconView.get_style_context().add_class('linked');
        iconView.get_style_context().add_class('raised');

        let listView = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'view-list-symbolic',
                                                                     pixel_size: 16 }) });
        listView.get_style_context().add_class('linked');
        listView.get_style_context().add_class('raised');

        Main.settings.bind('list-view',
                           iconView, 'active',
                           Gio.SettingsBindFlags.INVERT_BOOLEAN);
        Main.settings.bind('list-view',
                           listView, 'active',
                           Gio.SettingsBindFlags.DEFAULT);

        let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                spacing: 0,
                                hexpand: true });
        box.add(iconView);
        box.add(listView);

        let item = new Gtk.ToolItem();
        item.set_expand(true);
        item.add(box);

        this.searchEntry = new Gtk.Entry({ width_request: 260,
                                           secondary_icon_name: 'edit-find-symbolic',
                                           secondary_icon_sensitive: false,
                                           secondary_icon_activatable: false });
        let item2 = new Gtk.ToolItem();
        item2.add(this.searchEntry);

        this.searchEntry.connect('changed', Lang.bind(this, function() {
            let text = this.searchEntry.get_text();
            if (text && text != '') {
                this.searchEntry.secondary_icon_name = 'edit-clear-symbolic';
                this.searchEntry.secondary_icon_sensitive = true;
                this.searchEntry.secondary_icon_activatable = true;
            } else {
                this.searchEntry.secondary_icon_name = 'edit-find-symbolic';
                this.searchEntry.secondary_icon_sensitive = false;
                this.searchEntry.secondary_icon_activatable = false;
            }
        }));

        this.searchEntry.connect('icon-release', Lang.bind(this, function() {
            this.searchEntry.set_text('');
        }));

        this.widget.insert(item, 0);
        this.widget.insert(item2, 1);
    },

    setOverview: function() {
        this._clearToolbar();
        this._populateForOverview();
    }
}
