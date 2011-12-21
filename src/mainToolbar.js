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

const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Pango = imports.gi.Pango;

const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const Tweener = imports.util.tweener;
const WindowMode = imports.windowMode;

function ViewSelector() {
    this._init();
}

ViewSelector.prototype = {
    _init: function() {
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

        this.widget = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                    spacing: 0 });
        this.widget.add(iconView);
        this.widget.add(listView);

        this.widget.show_all();
    }
};

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._model = null;

        this._collectionId = 0;
        this._selectionChangedId = 0;

        this.widget = new Gd.MainToolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);
        this.widget.show();

        this.actor = new GtkClutter.Actor({ contents: this.widget });

        // setup listeners to mode changes that affect the toolbar layout
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._windowModeId =
            Global.modeController.connect('window-mode-changed',
                                          Lang.bind(this, this._onWindowModeChanged));
        this._onWindowModeChanged();

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._onToolbarClear();

                if (this._windowModeId != 0) {
                    Global.modeController.disconnect(this._windowModeId);
                    this._windowModeId = 0;
                }

                if (this._selectionModeId != 0) {
                    Global.selectionController.disconnect(this._selectionModeId);
                    this._selectionModeId = 0;
                }
            }));

        // setup listeners from toolbar actions to window mode changes
        this.widget.connect('selection-mode-request', Lang.bind(this,
            function(toolbar, requestMode) {
                Global.selectionController.setSelectionMode(requestMode);
            }));

        this.widget.connect('go-back-request', Lang.bind(this,
            function(toolbar) {
                let mode = Global.modeController.getWindowMode();
                if (mode == WindowMode.WindowMode.PREVIEW)
                    Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
                else
                    Global.collectionManager.setActiveItem(null);
            }));

        this.widget.connect('clear-request', Lang.bind(this, this._onToolbarClear));
    },

    _onToolbarClear: function() {
        this._model = null;

        if (this._collectionId != 0) {
            Global.collectionManager.disconnect(this._collectionId);
            this._collectionId = 0;
        }

        if (this._selectionChangedId != 0) {
            Global.selectionController.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }
    },

    _updateSelectionLabel: function() {
        let length = Global.selectionController.getSelection().length;
        let collection = Global.collectionManager.getActiveItem();
        let primary = null;
        let detail = null;

        if (length == 0)
            detail = _("Click on items to select them");
        else
            detail = (_("%d selected").format(length));

        if (collection) {
            primary = collection.name;
            detail = '(' + detail + ')';
        } else if (length != 0) {
            primary = detail;
            detail = null;
        }

        this.widget.set_labels(primary, detail);
    },

    _populateForSelectionMode: function() {
        this.widget.set_mode(Gd.MainToolbarMode.SELECTION);

        // connect to selection changes while in this mode
        this._selectionChangedId =
            Global.selectionController.connect('selection-changed',
                                               Lang.bind(this, this._updateSelectionLabel));
        this._updateSelectionLabel();

        this.widget.show_all();
    },

    _populateForOverview: function() {
        this.widget.set_mode(Gd.MainToolbarMode.OVERVIEW);

        // connect to active collection changes while in this mode
        this._collectionId =
            Global.collectionManager.connect('active-changed',
                                             Lang.bind(this, this._onActiveCollection));
        this._onActiveCollection();

        this.widget.show_all();
    },

    _onActiveCollection: function() {
        let item = Global.collectionManager.getActiveItem();

        if (item) {
            this.widget.set_back_visible(true);
            this.widget.set_labels(item.name, null);
        } else {
            this.widget.set_back_visible(false);
            this.widget.set_labels(_("New and Recent"), null);
        }
    },

    _populateForPreview: function(model) {
        this.widget.set_mode(Gd.MainToolbarMode.PREVIEW);

        this._updateModelLabels();

        this.widget.show_all();
    },

    _updateModelLabels: function() {
        let pageLabel = null;
        let doc = Global.documentManager.getActiveItem();

        if (this._model) {
            let curPage, totPages;

            curPage = this._model.get_page();
            totPages = this._model.get_document().get_n_pages();

            pageLabel = _("(%d of %d)").format(curPage + 1, totPages);
        }

        this.widget.set_labels(doc.name, pageLabel);
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._populateForOverview();
        else if (mode == WindowMode.WindowMode.PREVIEW)
            this._populateForPreview();
    },

    _onSelectionModeChanged: function() {
        if (Global.modeController.getWindowMode() != WindowMode.WindowMode.OVERVIEW)
            return;

        let mode = Global.selectionController.getSelectionMode();

        if (mode)
            this._populateForSelectionMode();
        else
            this._populateForOverview();
    },

    setModel: function(model) {
        if (!model)
            return;

        this._model = model;
        this._model.connect('page-changed', Lang.bind(this,
            function() {
                this._updateModelLabels();
            }));

        this._updateModelLabels();
    }
};

function FullscreenToolbar() {
    this._init();
};

FullscreenToolbar.prototype = {
    __proto__: MainToolbar.prototype,

    _init: function() {
        MainToolbar.prototype._init.call(this);

        this.actor.y = -(this.widget.get_preferred_height()[1]);
    },

    show: function() {
        Tweener.addTween(this.actor,
                         { y: 0,
                           time: 0.20,
                           transition: 'easeInQuad' });
    },

    hide: function() {
        Tweener.addTween(this.actor,
                         { y: -(this.widget.get_preferred_height()[1]),
                           time: 0.20,
                           transition: 'easeOutQuad' });
    }
};
