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
        this._whereId = 0;
        this._selectionChangedId = 0;

        this.widget = new Gtk.Toolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);

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

        if (this._whereId != 0) {
            Global.sideFilterController.disconnect(this._whereId);
            this._whereId = 0;
        }

        if (this._selectionChangedId != 0) {
            Global.selectionController.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }

        // destroy all the children
        this.widget.foreach(Lang.bind(this, function(widget) {
            widget.destroy();
        }));
    },

    _updateSelectionLabel: function() {
        let length = Global.selectionController.getSelection().length;

        if (length == 0)
            this._selectionLabel.set_markup('<i>' + _("Click on items to select them") + '</i>');
        else
            this._selectionLabel.set_markup('<b>' + _("%d selected").format(length) + '</b>');
    },

    _populateForSelectionMode: function() {
        // don't show icons in selection mode
        this.widget.set_style(Gtk.ToolbarStyle.TEXT);

        let selectAll = new Gtk.ToolButton({ stock_id: 'gtk-select-all' });
        selectAll.get_style_context().add_class('raised');
        this.widget.insert(selectAll, 0);

        selectAll.connect('clicked', Lang.bind(this,
            function() {
                Global.selectionController.selectAll();
            }));

        this._selectionLabel = new Gtk.Label();

        let labelItem = new Gtk.ToolItem({ child: this._selectionLabel });
        labelItem.set_expand(true);
        this.widget.insert(labelItem, 1);

        let cancel = new Gtk.ToolButton({ stock_id: 'gtk-cancel' });
        cancel.get_style_context().add_class('raised');
        this.widget.insert(cancel, 2);

        cancel.connect('clicked', Lang.bind(this,
            function() {
                Global.selectionController.setSelectionMode(false);
            }));

        // put the first and the last buttons in a size group, so that
        // the label stays center-aligned
        let sizeGroup = new Gtk.SizeGroup();
        sizeGroup.add_widget(cancel);
        sizeGroup.add_widget(selectAll);

        // connect to selection changes while in this mode
        this._selectionChangedId =
            Global.selectionController.connect('selection-changed',
                                               Lang.bind(this, this._updateSelectionLabel));
        this._updateSelectionLabel();

        this.widget.show_all();
    },

    _populateForOverview: function() {
        this.widget.set_style(Gtk.ToolbarStyle.ICONS);

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

        let item = new Gtk.ToolItem();
        item.add(box);

        this.widget.insert(item, 0);

        let item2 = new Gtk.ToolItem();
        this._whereLabel = new Gtk.Label({ margin_left: 12 });
        item2.add(this._whereLabel);
        this.widget.insert(item2, 1);

        let separator = new Gtk.SeparatorToolItem({ draw: false });
        separator.set_expand(true);
        this.widget.insert(separator, 2);

        let item3 = new Gtk.ToggleToolButton({ icon_name: 'emblem-default-symbolic' });
        item3.get_style_context().add_class('raised');
        this.widget.insert(item3, 3);

        item3.connect('toggled', Lang.bind(this,
            function(button) {
                // toggle selection mode if the button is toggled
                let isToggled = button.get_active();
                Global.selectionController.setSelectionMode(isToggled);
            }));
        // set initial state
        item3.set_active(Global.selectionController.getSelectionMode());

        // connect to sidebar filter changes while in this mode
        this._whereId =
            Global.sideFilterController.connect('changed',
                                                Lang.bind(this, this._onSideFilterChanged));
        this._onSideFilterChanged();

        this.widget.show_all();
    },

    _populateForPreview: function(model) {
        this.widget.set_style(Gtk.ToolbarStyle.ICONS);

        let back = new Gtk.ToolButton({ icon_name: 'go-previous-symbolic' });
        back.get_style_context().add_class('raised');
        this.widget.insert(back, 0);

        back.connect('clicked', Lang.bind(this,
            function() {
                Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
            }));

        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                  halign: Gtk.Align.CENTER,
                                  valign: Gtk.Align.CENTER });

        this._titleLabel = new Gtk.Label();
        grid.add(this._titleLabel);

        this._pageLabel = new Gtk.Label({ margin_left: 12 });
        this._pageLabel.get_style_context().add_class('dim-label');
        grid.add(this._pageLabel);

        let labelItem = new Gtk.ToolItem({ child: grid });
        labelItem.set_expand(true);
        this.widget.insert(labelItem, 1);

        this._updateModelLabels();

        let rightGroup = new Gtk.ToolItem();
        this.widget.insert(rightGroup, 2);

        let sizeGroup = new Gtk.SizeGroup();
        sizeGroup.add_widget(back);
        sizeGroup.add_widget(rightGroup);

        this.widget.show_all();
    },

    _updateModelLabels: function() {
        let pageLabel = null;
        let doc = Global.documentManager.getActiveItem();

        let titleLabel = ('<b>%s</b>').format(GLib.markup_escape_text(doc.title, -1));
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

    _onSideFilterChanged: function() {
        let item = Global.sideFilterController.getWhereItem();

        if (!item)
            return;

        this._whereLabel.set_markup(('<b>%s</b>').format(item.name));
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        this._clearToolbar();

        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._populateForOverview();
        else if (mode == WindowMode.WindowMode.PREVIEW)
            this._populateForPreview();
    },

    _onSelectionModeChanged: function(controller, mode) {
        if (Global.modeController.getWindowMode() != WindowMode.WindowMode.OVERVIEW)
            return;

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

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            y: -(this.widget.get_preferred_height()[1]) });
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
