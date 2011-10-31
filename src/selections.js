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
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Global = imports.global;
const Tweener = imports.util.tweener;

const Lang = imports.lang;
const Signals = imports.signals;

function SelectionController() {
    this._init();
};

SelectionController.prototype = {
    _init: function() {
        this._selection = [];
        this._selectionMode = false;
    },

    selectAll: function() {
        this.emit('select-all');
    },

    setSelection: function(selection) {
        if (this._isFrozen)
            return;

        if (!selection)
            this._selection = [];
        else
            this._selection = selection;

        this.emit('selection-changed', this._selection);
    },

    getSelection: function() {
        return this._selection;
    },

    freezeSelection: function(freeze) {
        if (freeze == this._isFrozen)
            return;

        this._isFrozen = freeze;
    },

    setSelectionMode: function(setting) {
        if (this._selectionMode == setting)
            return;

        this._selectionMode = setting;
        this.emit('selection-mode-changed', this._selectionMode);
    },

    getSelectionMode: function() {
        return this._selectionMode;
    }
};
Signals.addSignalMethods(SelectionController.prototype);

function SelectionToolbar() {
    this._init();
}

SelectionToolbar.prototype = {
    _init: function() {
        this._itemListeners = {};
        this._insideRefresh = false;

        this.widget = new Gtk.Toolbar({ show_arrow: false,
                                        icon_size: Gtk.IconSize.LARGE_TOOLBAR });

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            show_on_set_parent: false,
                                            opacity: 0 });
        let actorWidget = this.actor.get_widget();
        actorWidget.get_style_context().add_class('osd');

        this._toolbarFavorite = new Gtk.ToggleToolButton({ icon_name: 'emblem-favorite-symbolic' });
        this.widget.insert(this._toolbarFavorite, 0);
        this._toolbarFavorite.connect('clicked', Lang.bind(this, this._onToolbarFavorite));

        this._separator = new Gtk.SeparatorToolItem();
        this.widget.insert(this._separator, 1);

        this._toolbarOpen = new Gtk.ToolButton({ icon_name: 'document-open-symbolic' });
        this.widget.insert(this._toolbarOpen, 2);
        this._toolbarOpen.connect('clicked', Lang.bind(this, this._onToolbarOpen));

        this.widget.show();

        Global.selectionController.connect('selection-mode-changed',
                                           Lang.bind(this, this._onSelectionModeChanged));
        Global.selectionController.connect('selection-changed',
                                           Lang.bind(this, this._onSelectionChanged));
    },

    _onSelectionModeChanged: function(controller, mode) {
        if (mode)
            this._onSelectionChanged();
        else
            this._fadeOut();
    },

    _onSelectionChanged: function() {
        if (!Global.selectionController.getSelectionMode())
            return;

        let selection = Global.selectionController.getSelection();
        this._setItemListeners(selection);

        if (selection.length > 0) {
            this._setItemVisibility();
            this._fadeIn();
        } else {
            this._fadeOut();
        }
    },

    _setItemListeners: function(selection) {
        for (idx in this._itemListeners) {
            let doc = this._itemListeners[idx];
            doc.disconnect(idx);
            delete this._itemListeners[idx];
        }

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                let id = doc.connect('info-updated', Lang.bind(this, this._setItemVisibility));
                this._itemListeners[id] = doc;
            }));
    },

    _setItemVisibility: function() {
        let apps = [];
        let favCount = 0;
        let showFavorite = true;

        this._insideRefresh = true;

        let selection = Global.selectionController.getSelection();
        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);

                if (doc.favorite)
                    favCount++;

                if (apps.indexOf(doc.defaultAppName) == -1)
                    apps.push(doc.defaultAppName);
            }));

        showFavorite &= ((favCount == 0) || (favCount == selection.length));

        // if we're showing the favorite icon, also show the separator
        this._separator.set_visible(showFavorite);

        let openLabel = null;
        if (apps.length == 1) {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open with %s").format(apps[0]);
        } else {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open");
        }

        this._toolbarOpen.set_tooltip_text(openLabel);
        this._toolbarOpen.show();

        if (showFavorite) {
            let isFavorite = (favCount == selection.length);
            let favoriteLabel = '';

            if (isFavorite) {
                favoriteLabel = _("Remove from favorites");
                this._toolbarFavorite.set_active(true);
                this._toolbarFavorite.get_style_context().add_class('favorite');
            } else {
                favoriteLabel = _("Add to favorites");
                this._toolbarFavorite.set_active(false);
                this._toolbarFavorite.get_style_context().remove_class('favorite');
            }

            this._toolbarFavorite.reset_style();
            this._toolbarFavorite.set_tooltip_text(favoriteLabel);
            this._toolbarFavorite.show();
        } else {
            this._toolbarFavorite.hide();
        }

        this._insideRefresh = false;
    },

    _onToolbarOpen: function(widget) {
        let selection = Global.selectionController.getSelection();

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                doc.open(widget.get_screen(), Gtk.get_current_event_time());
            }));
    },

    _onToolbarFavorite: function(widget) {
        if (this._insideRefresh)
            return;

        let selection = Global.selectionController.getSelection();

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                doc.setFavorite(!doc.favorite);
            }));
    },

    _fadeIn: function() {
        if (this.actor.opacity != 0)
            return;

        this.actor.opacity = 0;
        this.actor.show();

        Tweener.addTween(this.actor,
            { opacity: 255,
              time: 0.30,
              transition: 'easeOutQuad' });
    },

    _fadeOut: function() {
        Tweener.addTween(this.actor,
            { opacity: 0,
              time: 0.30,
              transition: 'easeOutQuad',
              onComplete: function() {
                  this.actor.hide();
              },
              onCompleteScope: this });
    }
};
