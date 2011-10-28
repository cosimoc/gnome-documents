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
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const Manager = imports.manager;
const Sources = imports.sources;
const Tweener = imports.util.tweener;
const Utils = imports.utils;

const _SEARCH_ENTRY_TIMEOUT = 200;

function SearchType(params) {
    this._init(params);
}

SearchType.prototype = {
    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
    }
};

function SearchTypeManager() {
    this._init();
}

SearchTypeManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this, _("Type"));

        this.addItem(new SearchType({ id: 'all',
                                      name: _("All") }));
        this.addItem(new SearchType({ id: 'collections',
                                      name: _("Collections") }));
        this.addItem(new SearchType({ id: 'pdf',
                                      name: _("PDF Files") }));
        this.addItem(new SearchType({ id: 'presentations',
                                      name: _("Presentations") }));
        this.addItem(new SearchType({ id: 'spreadsheets',
                                      name: _("Spreadsheets") }));
        this.addItem(new SearchType({ id: 'textdocs',
                                      name: _("Text Documents") }));

        this.setActiveItemById('all');
    }
};

function Match(params) {
    this._init(params);
}

Match.prototype = {
    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
    }
};

function MatchManager() {
    this._init();
}

MatchManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this, _("Match"));

        this.addItem(new Match({ id: 'all',
                                 name: _("All") }));
        this.addItem(new Match({ id: 'title',
                                 name: _("Title") }));
        this.addItem(new Match({ id: 'author',
                                 name: _("Author") }));

        this.setActiveItemById('all');
    }
};

function Dropdown() {
    this._init();
}

Dropdown.prototype = {
    _init: function() {
        this._sourceView = new Manager.BaseView(Global.sourceManager);
        this._typeView = new Manager.BaseView(Global.typeManager);
        this._matchView = new Manager.BaseView(Global.matchManager);

        this.widget = new Gtk.Frame({ shadow_type: Gtk.ShadowType.IN });
        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 0 });
        let actorWidget = this.actor.get_widget();
        actorWidget.get_style_context().add_class('dropdown');

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.widget.add(this._grid);

        this._grid.add(this._sourceView.widget);
        this._grid.add(this._typeView.widget);
        this._grid.add(this._matchView.widget);

        this.widget.show_all();

        Global.searchFilterController.connect('search-dropdown',
                                              Lang.bind(this, this._onSearchDropdown));
        this._onSearchDropdown();
    },

    _onSearchDropdown: function() {
        let state = Global.searchFilterController.getDropdownState();
        if (state)
            this._fadeIn();
        else
            this._fadeOut();
    },

    _fadeIn: function() {
        this.actor.raise_top();
        Tweener.addTween(this.actor, { opacity: 245,
                                       time: 0.20,
                                       transition: 'easeOutQuad' });
    },

    _fadeOut: function() {
        Tweener.addTween(this.actor, { opacity: 0,
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this.actor.lower_bottom();
                                       },
                                       onCompleteScope: this });
    }
};

function Searchbar() {
    this._init();
}

Searchbar.prototype = {
    _init: function() {
        this._searchEventId = 0;
        this._searchFocusId = 0;
        this._searchEntryTimeout = 0;
        this._searchFadingIn = false;

        this.widget = new Gtk.Toolbar();
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            height: 0 });

        this._searchEntry = new Gtk.Entry({ width_request: 260,
                                            secondary_icon_name: 'edit-find-symbolic',
                                            secondary_icon_sensitive: false,
                                            secondary_icon_activatable: false,
                                            no_show_all: true,
                                            hexpand: true });

        let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.add(this._searchEntry);

        this._dropdownButton = new Gtk.ToggleButton(
            { child: new Gtk.Arrow({ arrow_type: Gtk.ArrowType.DOWN }) });
        this._dropdownButton.connect('toggled', Lang.bind(this,
            function() {
                let active = this._dropdownButton.get_active();
                Global.searchFilterController.setDropownState(active);
            }));

        box.add(this._dropdownButton);

        let container = new Gd.MarginContainer({ min_margin: 6,
                                                 max_margin: 64 });
        container.add(box);

        let item = new Gtk.ToolItem();
        item.set_expand(true);
        item.add(container);

        this._searchEntry.connect('key-press-event', Lang.bind(this,
            function(widget, event) {
                let keyval = event.get_keyval()[1];

                if (keyval == Gdk.KEY_Escape) {
                    this._moveOut();
                    return true;
                }

                return false;
            }));

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
                    Global.searchFilterController.setFilter(currentText);
            }));
        }));

        this._searchEntry.connect('icon-release', Lang.bind(this, function() {
            this._searchEntry.set_text('');
        }));

        this._searchFocusId =
            Global.focusController.connect('toggle-search', Lang.bind(this, this._onToggleSearch));
        this._searchEventId =
            Global.focusController.connect('deliver-event', Lang.bind(this, this._onDeliverEvent));

        this.widget.insert(item, 0);
        this._searchEntry.set_text(Global.searchFilterController.getFilter());

        this.widget.show_all();
    },

    destroy: function() {
        if (this._searchFocusId != 0) {
            Global.focusController.disconnect(this._searchFocusId);
            this._searchFocusId = 0;
        }

        if (this._searchEventId != 0) {
            Global.focusController.disconnect(this._searchEventId);
            this._searchEventId = 0;
        }

        this.widget.destroy();
    },

    _onToggleSearch: function() {
        if (Global.focusController.getSearchVisible())
            this._moveOut();
        else
            this._moveIn(Gtk.get_current_event_device());
    },

    _onDeliverEvent: function(controller, event) {
        if (!this._searchEntry.get_realized())
            this._searchEntry.realize();

        let preeditChanged = false;
        let preeditChangedId =
            this._searchEntry.connect('preedit-changed', Lang.bind(this,
                function() {
                    preeditChanged = true;
                }));

        let oldText = this._searchEntry.get_text();
        let res = this._searchEntry.event(event);
        let newText = this._searchEntry.get_text();

        this._searchEntry.disconnect(preeditChangedId);

        if (((res && (newText != oldText)) || preeditChanged) &&
            !this._searchFadingIn) {
            this._moveIn(event.get_device());
        }
    },

    _moveIn: function(eventDevice) {
        this._searchEntry.show();
        this._searchFadingIn = true;

        Tweener.addTween(this.actor, { height: this.widget.get_preferred_height()[1],
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this._searchFadingIn = false;
                                           Global.focusController.setSearchVisible(true);

                                           Gd.entry_focus_hack(this._searchEntry, eventDevice);
                                       },
                                       onCompleteScope: this });
    },

    _moveOut: function() {
        Global.focusController.setSearchVisible(false);
        Tweener.addTween(this.actor, { height: 0,
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this._searchEntry.hide();
                                           this._dropdownButton.set_active(false);
                                       },
                                       onCompleteScope: this });
    }
};
