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

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._model = null;
        this._overviewBack = null;
        this._selectionWhereLabel = null;
        this._selectionLabel = null;
        this._pageLabel = null;
        this._titleLabel = null;
        this._whereLabel = null;

        this._collectionId = 0;
        this._selectionChangedId = 0;

        this.widget = new Gtk.Toolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);
        this.widget.show();

        this._leftGroup = new Gtk.ToolItem({ margin_right: 12 });
        this.widget.insert(this._leftGroup, -1);

        this._centerGroup = new Gtk.ToolItem();
        this._centerGroup.set_expand(true);
        this.widget.insert(this._centerGroup, -1);

        this._rightGroup = new Gtk.ToolItem({ margin_left: 12 });
        this.widget.insert(this._rightGroup, -1);

        this._sizeGroup = new Gtk.SizeGroup();
        this._sizeGroup.add_widget(this._leftGroup);
        this._sizeGroup.add_widget(this._rightGroup);

        this.actor = new GtkClutter.Actor({ contents: this.widget });

        // setup listeners to mode changes that affect the toolbar layout
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._windowModeId =
            Global.modeController.connect('window-mode-changed',
                                          Lang.bind(this, this._onWindowModeChanged));
        this._onWindowModeChanged();
    },

    _clearToolbar: function() {
        this._model = null;
        this._whereLabel = null;
        this._selectionLabel = null;
        this._selectionWhereLabel = null;
        this._pageLabel = null;
        this._titleLabel = null;

        if (this._collectionId != 0) {
            Global.collectionManager.disconnect(this._collectionId);
            this._collectionId = 0;
        }

        if (this._selectionChangedId != 0) {
            Global.selectionController.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }

        // destroy all the children of the groups
        let child = this._leftGroup.get_child();
        if (child)
            child.destroy();

        child = this._centerGroup.get_child();
        if (child)
            child.destroy();

        child = this._rightGroup.get_child();
        if (child)
            child.destroy();

        let context = this.widget.get_style_context();
        if (context.has_class('documents-selection-mode')) {
            context.remove_class('documents-selection-mode');
            this.widget.reset_style();
        }
    },

    _buildViewSelector: function() {
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
                                spacing: 0 });
        box.add(iconView);
        box.add(listView);

        return box;
    },

    _updateSelectionLabel: function() {
        let length = Global.selectionController.getSelection().length;
        let collection = Global.collectionManager.getActiveItem();

        // if we are inside a collection, the selected label is dim and needs to be
        // spaced from the collection label
        if (collection) {
            this._selectionWhereLabel.show();
            this._selectionWhereLabel.set_markup ('<b>' + collection.name + '</b>');

            this._selectionLabel.margin_left = 12;
        } else {
            this._selectionWhereLabel.hide();
            this._selectionLabel.margin_left = 0;
        }

        let selectionLabelCtx = this._selectionLabel.get_style_context();

        if (length == 0 || collection) {
            selectionLabelCtx.add_class('dim-label');
            this._selectionLabel.reset_style();
        } else {
            if (selectionLabelCtx.has_class('dim-label')) {
                selectionLabelCtx.remove_class('dim-label');
                this._selectionLabel.reset_style();
            }
        }

        let markup = '';

        if (length == 0)
            markup = _("Click on items to select them");
        else
            markup = (_("%d selected").format(length));

        if (collection)
            markup = '(' + markup + ')';
        else
            markup = '<b>' + markup + '</b>';

        this._selectionLabel.set_markup(markup);
    },

    _populateForSelectionMode: function() {
        this.widget.get_style_context().add_class('documents-selection-mode');
        this.widget.reset_style();

        // centered label
        this._selectionWhereLabel = new Gtk.Label({ no_show_all: true });
        this._selectionLabel = new Gtk.Label();

        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                  valign: Gtk.Align.CENTER,
                                  halign: Gtk.Align.CENTER });
        grid.add(this._selectionWhereLabel);
        grid.add(this._selectionLabel);
        this._centerGroup.add(grid);

        // right section
        let cancel = new Gtk.Button({ use_stock: true,
                                      label: _("Done") });
        cancel.get_style_context().add_class('raised');
        this._rightGroup.add(cancel);

        cancel.connect('clicked', Lang.bind(this,
            function() {
                Global.selectionController.setSelectionMode(false);
            }));

        // connect to selection changes while in this mode
        this._selectionChangedId =
            Global.selectionController.connect('selection-changed',
                                               Lang.bind(this, this._updateSelectionLabel));
        this._updateSelectionLabel();

        this.widget.show_all();
    },

    _populateForOverview: function() {
        // left section
        this._overviewBack = new Gtk.Button({ child: new Gtk.Image({ icon_name: 'go-previous-symbolic',
                                                                     pixel_size: 16,
                                                                     visible: true }),
                                              no_show_all: true,
                                              halign: Gtk.Align.START });
        this._overviewBack.get_style_context().add_class('raised');
        this._leftGroup.add(this._overviewBack);

        this._overviewBack.connect('clicked', Lang.bind(this,
            function() {
                // go back to the general overview
                Global.collectionManager.setActiveItem(null);
            }));

        // centered label
        this._whereLabel = new Gtk.Label();
        this._centerGroup.add(this._whereLabel);

        // right section
        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                  column_spacing: 12 });
        this._rightGroup.add(grid);

        // view mode selector
        let selector = this._buildViewSelector();
        grid.add(selector);

        // selection mode toggle
        let button = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'emblem-default-symbolic',
                                                                   pixel_size: 16 }) });
        button.get_style_context().add_class('raised');
        grid.add(button);

        button.connect('toggled', Lang.bind(this,
            function(button) {
                // toggle selection mode if the button is toggled
                let isToggled = button.get_active();
                Global.selectionController.setSelectionMode(isToggled);
            }));
        // set initial state
        button.set_active(Global.selectionController.getSelectionMode());

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
            this._overviewBack.show();
            this._whereLabel.set_markup(('<b>%s</b>').format(item.name));
        } else {
            this._overviewBack.hide();
            this._whereLabel.set_text('');
        }
    },

    _populateForPreview: function(model) {
        // left section
        let back = new Gtk.ToggleButton({ child: new Gtk.Image({ icon_name: 'go-previous-symbolic',
                                                                 pixel_size: 16 }) });
        back.get_style_context().add_class('raised');
        this._leftGroup.add(back);

        back.connect('clicked', Lang.bind(this,
            function() {
                Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
            }));

        // centered grid with labels
        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                  halign: Gtk.Align.CENTER,
                                  valign: Gtk.Align.CENTER });
        this._centerGroup.add(grid);

        this._titleLabel = new Gtk.Label({ ellipsize: Pango.EllipsizeMode.END });
        grid.add(this._titleLabel);

        this._pageLabel = new Gtk.Label({ margin_left: 12 });
        this._pageLabel.get_style_context().add_class('dim-label');
        grid.add(this._pageLabel);

        this._updateModelLabels();

        this.widget.show_all();
    },

    _updateModelLabels: function() {
        let pageLabel = null;
        let doc = Global.documentManager.getActiveItem();

        let titleLabel = ('<b>%s</b>').format(GLib.markup_escape_text(doc.name, -1));
        this._titleLabel.set_markup(titleLabel);

        if (this._model) {
            let curPage, totPages;

            curPage = this._model.get_page();
            totPages = this._model.get_document().get_n_pages();

            pageLabel = _("(%d of %d)").format(curPage + 1, totPages);
        }

        if (pageLabel) {
            this._pageLabel.show();
            this._pageLabel.set_text(pageLabel);
        } else {
            this._pageLabel.hide();
        }
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        this._clearToolbar();

        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._populateForOverview();
        else if (mode == WindowMode.WindowMode.PREVIEW)
            this._populateForPreview();
    },

    _onSelectionModeChanged: function() {
        if (Global.modeController.getWindowMode() != WindowMode.WindowMode.OVERVIEW)
            return;

        let mode = Global.selectionController.getSelectionMode();
        this._clearToolbar();

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
    },

    destroy: function() {
        if (this._windowModeId != 0) {
            Global.modeController.disconnect(this._windowModeId);
            this._windowModeId = 0;
        }

        if (this._selectionModeId != 0) {
            Global.selectionController.disconnect(this._selectionModeId);
            this._selectionModeId = 0;
        }

        this.widget.destroy();
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
