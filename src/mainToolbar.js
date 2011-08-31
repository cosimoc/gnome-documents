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

const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Global = imports.global;
const MainWindow = imports.mainWindow;

const _SEARCH_ENTRY_TIMEOUT = 200;

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._searchEntryTimeout = 0;
        this.widget = new Gtk.Toolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);
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

        Global.settings.bind('list-view',
                             iconView, 'active',
                             Gio.SettingsBindFlags.INVERT_BOOLEAN);
        Global.settings.bind('list-view',
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

        this._searchEntry = new Gtk.Entry({ width_request: 260,
                                           secondary_icon_name: 'edit-find-symbolic',
                                           secondary_icon_sensitive: false,
                                           secondary_icon_activatable: false });
        let item2 = new Gtk.ToolItem();
        item2.add(this._searchEntry);

        this._searchEntry.connect('changed', Lang.bind(this, function() {
            let text = this._searchEntry.get_text();
            if (text && text != '') {
                this._searchEntry.secondary_icon_name = 'edit-clear-symbolic';
                this._searchEntry.secondary_icon_sensitive = true;
                this._searchEntry.secondary_icon_activatable = true;
            } else {
                this._searchEntry.secondary_icon_name = 'edit-find-symbolic';
                this._searchEntry.secondary_icon_sensitive = false;
                this._searchEntry.secondary_icon_activatable = false;
            }

            if (this._searchEntryTimeout != 0) {
                Mainloop.source_remove(this._searchEntryTimeout);
                this._searchEntryTimeout = 0;
            }

            this._searchEntryTimeout = Mainloop.timeout_add(_SEARCH_ENTRY_TIMEOUT, Lang.bind(this,
                function() {
                    this._searchEntryTimeout = 0;

                    let currentText = this._searchEntry.get_text();
                    Global.filterController.setFilter(currentText);
            }));
        }));

        this._searchEntry.connect('icon-release', Lang.bind(this, function() {
            this._searchEntry.set_text('');
        }));

        this.widget.insert(item, 0);
        this.widget.insert(item2, 1);

        this.widget.show_all();

        this._searchEntry.set_text(Global.filterController.getFilter());
    },

    _populateForPreview: function(model, document) {
        let back = new Gtk.ToolButton({ icon_name: 'go-previous-symbolic' });
        back.get_style_context().add_class('raised');
        this.widget.insert(back, 0);

        back.connect('clicked', Lang.bind(this,
            function() {
                this.emit('back-clicked');
            }));

        this._modelLabel = new Gtk.Label();
        let labelItem = new Gtk.ToolItem({ child: this._modelLabel });
        labelItem.set_expand(true);
        this.widget.insert(labelItem, 1);

        let rightGroup = new Gtk.ToolItem();
        this.widget.insert(rightGroup, 2);

        let sizeGroup = new Gtk.SizeGroup();
        sizeGroup.add_widget(back);
        sizeGroup.add_widget(rightGroup);

        this.widget.show_all();
    },

    _updatePageLabel: function(label, model, document) {
        let curPage, totPages;

        curPage = model.get_page();
        totPages = document.get_n_pages();

        label.set_text(_("page %d of %d").format(curPage + 1, totPages));
    },

    setWindowMode: function(windowMode) {
        this._clearToolbar();

        if (windowMode == MainWindow.WindowMode.OVERVIEW)
            this._populateForOverview();
        else
            this._populateForPreview();
    },

    setModel: function(model, document) {
        model.connect('page-changed', Lang.bind(this,
            function() {
                this._updatePageLabel(this._modelLabel, model, document);
            }));

        this._updatePageLabel(this._modelLabel, model, document);
    }
};
Signals.addSignalMethods(MainToolbar.prototype);
