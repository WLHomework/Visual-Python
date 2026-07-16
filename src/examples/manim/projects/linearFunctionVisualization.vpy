{
  "version": 1,
  "name": "LinearFunctionVisualization.vpy",
  "workspace": {
    "blocks": {
      "languageVersion": 0,
      "blocks": [
        {
          "type": "visual_python_manim_scene",
          "x": 96,
          "y": 72,
          "fields": {
            "NAME": "LinearFunctionVisualization",
            "SCENE_TYPE": "Scene"
          },
          "inputs": {
            "BODY": {
              "block": {
                "type": "visual_python_manim_assign",
                "fields": {
                  "VAR": "coords"
                },
                "inputs": {
                  "MOBJECT": {
                    "block": {
                      "type": "visual_python_manim_shift",
                      "inputs": {
                        "MOBJECT": {
                          "block": {
                            "type": "python_new_object_structured",
                            "fields": {
                              "TARGET": "NumberPlane",
                              "ARG_NAME0": "x_range",
                              "ARG_NAME1": "y_range",
                              "ARG_NAME2": "x_length",
                              "ARG_NAME3": "y_length",
                              "ARG_NAME4": "background_line_style",
                              "ARG_NAME5": "axis_config"
                            },
                            "extraState": {
                              "arguments": [
                                {
                                  "kind": "keyword",
                                  "name": "x_range"
                                },
                                {
                                  "kind": "keyword",
                                  "name": "y_range"
                                },
                                {
                                  "kind": "keyword",
                                  "name": "x_length"
                                },
                                {
                                  "kind": "keyword",
                                  "name": "y_length"
                                },
                                {
                                  "kind": "keyword",
                                  "name": "background_line_style"
                                },
                                {
                                  "kind": "keyword",
                                  "name": "axis_config"
                                }
                              ]
                            },
                            "inputs": {
                              "ARG0": {
                                "block": {
                                  "type": "python_list_collection",
                                  "extraState": {
                                    "itemCount": 3
                                  },
                                  "inputs": {
                                    "ITEM0": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": -6
                                        }
                                      }
                                    },
                                    "ITEM1": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 6
                                        }
                                      }
                                    },
                                    "ITEM2": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 1
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "ARG1": {
                                "block": {
                                  "type": "python_list_collection",
                                  "extraState": {
                                    "itemCount": 3
                                  },
                                  "inputs": {
                                    "ITEM0": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": -4
                                        }
                                      }
                                    },
                                    "ITEM1": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 4
                                        }
                                      }
                                    },
                                    "ITEM2": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 1
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "ARG2": {
                                "block": {
                                  "type": "math_number",
                                  "fields": {
                                    "NUM": 7.5
                                  }
                                }
                              },
                              "ARG3": {
                                "block": {
                                  "type": "math_number",
                                  "fields": {
                                    "NUM": 5
                                  }
                                }
                              },
                              "ARG4": {
                                "block": {
                                  "type": "python_dynamic_dict",
                                  "extraState": {
                                    "itemCount": 3
                                  },
                                  "inputs": {
                                    "KEY0": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "stroke_color"
                                        }
                                      }
                                    },
                                    "VALUE0": {
                                      "block": {
                                        "type": "visual_python_manim_color_constant",
                                        "fields": {
                                          "VALUE": "GRAY"
                                        }
                                      }
                                    },
                                    "KEY1": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "stroke_width"
                                        }
                                      }
                                    },
                                    "VALUE1": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 1
                                        }
                                      }
                                    },
                                    "KEY2": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "stroke_opacity"
                                        }
                                      }
                                    },
                                    "VALUE2": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 0.5
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "ARG5": {
                                "block": {
                                  "type": "python_dynamic_dict",
                                  "extraState": {
                                    "itemCount": 4
                                  },
                                  "inputs": {
                                    "KEY0": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "stroke_color"
                                        }
                                      }
                                    },
                                    "VALUE0": {
                                      "block": {
                                        "type": "visual_python_manim_color_constant",
                                        "fields": {
                                          "VALUE": "BLUE"
                                        }
                                      }
                                    },
                                    "KEY1": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "stroke_width"
                                        }
                                      }
                                    },
                                    "VALUE1": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 2
                                        }
                                      }
                                    },
                                    "KEY2": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "include_tip"
                                        }
                                      }
                                    },
                                    "VALUE2": {
                                      "block": {
                                        "type": "logic_boolean",
                                        "fields": {
                                          "BOOL": "FALSE"
                                        }
                                      }
                                    },
                                    "KEY3": {
                                      "block": {
                                        "type": "text",
                                        "fields": {
                                          "TEXT": "include_ticks"
                                        }
                                      }
                                    },
                                    "VALUE3": {
                                      "block": {
                                        "type": "logic_boolean",
                                        "fields": {
                                          "BOOL": "TRUE"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "VECTOR": {
                          "block": {
                            "type": "visual_python_manim_scaled_direction",
                            "fields": {
                              "DIRECTION": "RIGHT"
                            },
                            "inputs": {
                              "SCALE": {
                                "block": {
                                  "type": "math_number",
                                  "fields": {
                                    "NUM": 2.5
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "python_call_statement_structured",
                    "fields": {
                      "TARGET": "self.play",
                      "ARG_NAME1": "run_time"
                    },
                    "extraState": {
                      "arguments": [
                        {
                          "kind": "positional",
                          "name": "name"
                        },
                        {
                          "kind": "keyword",
                          "name": "run_time"
                        }
                      ]
                    },
                    "inputs": {
                      "ARG0": {
                        "block": {
                          "type": "python_call_structured",
                          "fields": {
                            "TARGET": "Create"
                          },
                          "extraState": {
                            "arguments": [
                              {
                                "kind": "positional",
                                "name": "name"
                              }
                            ]
                          },
                          "inputs": {
                            "ARG0": {
                              "block": {
                                "type": "python_attribute",
                                "fields": {
                                  "ATTRIBUTE": "background_lines"
                                },
                                "inputs": {
                                  "OBJECT": {
                                    "block": {
                                      "type": "variables_get",
                                      "fields": {
                                        "VAR": {
                                          "name": "coords"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "ARG1": {
                        "block": {
                          "type": "math_number",
                          "fields": {
                            "NUM": 1
                          }
                        }
                      }
                    },
                    "next": {
                      "block": {
                        "type": "python_call_statement_structured",
                        "fields": {
                          "TARGET": "self.play",
                          "ARG_NAME1": "run_time"
                        },
                        "extraState": {
                          "arguments": [
                            {
                              "kind": "positional",
                              "name": "name"
                            },
                            {
                              "kind": "keyword",
                              "name": "run_time"
                            }
                          ]
                        },
                        "inputs": {
                          "ARG0": {
                            "block": {
                              "type": "python_call_structured",
                              "fields": {
                                "TARGET": "Create"
                              },
                              "extraState": {
                                "arguments": [
                                  {
                                    "kind": "positional",
                                    "name": "name"
                                  }
                                ]
                              },
                              "inputs": {
                                "ARG0": {
                                  "block": {
                                    "type": "python_attribute",
                                    "fields": {
                                      "ATTRIBUTE": "axes"
                                    },
                                    "inputs": {
                                      "OBJECT": {
                                        "block": {
                                          "type": "variables_get",
                                          "fields": {
                                            "VAR": {
                                              "name": "coords"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          },
                          "ARG1": {
                            "block": {
                              "type": "math_number",
                              "fields": {
                                "NUM": 1.5
                              }
                            }
                          }
                        },
                        "next": {
                          "block": {
                            "type": "visual_python_manim_assign",
                            "fields": {
                              "VAR": "x_label"
                            },
                            "inputs": {
                              "MOBJECT": {
                                "block": {
                                  "type": "visual_python_manim_next_to",
                                  "inputs": {
                                    "MOBJECT": {
                                      "block": {
                                        "type": "python_new_object_structured",
                                        "fields": {
                                          "TARGET": "Text",
                                          "ARG_NAME1": "font_size",
                                          "ARG_NAME2": "color"
                                        },
                                        "extraState": {
                                          "arguments": [
                                            {
                                              "kind": "positional",
                                              "name": "name"
                                            },
                                            {
                                              "kind": "keyword",
                                              "name": "font_size"
                                            },
                                            {
                                              "kind": "keyword",
                                              "name": "color"
                                            }
                                          ]
                                        },
                                        "inputs": {
                                          "ARG0": {
                                            "block": {
                                              "type": "text",
                                              "fields": {
                                                "TEXT": "x"
                                              }
                                            }
                                          },
                                          "ARG1": {
                                            "block": {
                                              "type": "math_number",
                                              "fields": {
                                                "NUM": 20
                                              }
                                            }
                                          },
                                          "ARG2": {
                                            "block": {
                                              "type": "visual_python_manim_color_constant",
                                              "fields": {
                                                "VALUE": "WHITE"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "TARGET": {
                                      "block": {
                                        "type": "python_call_structured",
                                        "fields": {
                                          "TARGET": "coords.x_axis.get_end"
                                        },
                                        "extraState": {
                                          "arguments": []
                                        },
                                        "inputs": {}
                                      }
                                    },
                                    "DIRECTION": {
                                      "block": {
                                        "type": "visual_python_manim_direction_constant",
                                        "fields": {
                                          "VALUE": "RIGHT"
                                        }
                                      }
                                    },
                                    "BUFF": {
                                      "block": {
                                        "type": "math_number",
                                        "fields": {
                                          "NUM": 0.3
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "next": {
                              "block": {
                                "type": "visual_python_manim_assign",
                                "fields": {
                                  "VAR": "y_label"
                                },
                                "inputs": {
                                  "MOBJECT": {
                                    "block": {
                                      "type": "visual_python_manim_next_to",
                                      "inputs": {
                                        "MOBJECT": {
                                          "block": {
                                            "type": "python_new_object_structured",
                                            "fields": {
                                              "TARGET": "Text",
                                              "ARG_NAME1": "font_size",
                                              "ARG_NAME2": "color"
                                            },
                                            "extraState": {
                                              "arguments": [
                                                {
                                                  "kind": "positional",
                                                  "name": "name"
                                                },
                                                {
                                                  "kind": "keyword",
                                                  "name": "font_size"
                                                },
                                                {
                                                  "kind": "keyword",
                                                  "name": "color"
                                                }
                                              ]
                                            },
                                            "inputs": {
                                              "ARG0": {
                                                "block": {
                                                  "type": "text",
                                                  "fields": {
                                                    "TEXT": "y"
                                                  }
                                                }
                                              },
                                              "ARG1": {
                                                "block": {
                                                  "type": "math_number",
                                                  "fields": {
                                                    "NUM": 20
                                                  }
                                                }
                                              },
                                              "ARG2": {
                                                "block": {
                                                  "type": "visual_python_manim_color_constant",
                                                  "fields": {
                                                    "VALUE": "WHITE"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "TARGET": {
                                          "block": {
                                            "type": "python_call_structured",
                                            "fields": {
                                              "TARGET": "coords.y_axis.get_end"
                                            },
                                            "extraState": {
                                              "arguments": []
                                            },
                                            "inputs": {}
                                          }
                                        },
                                        "DIRECTION": {
                                          "block": {
                                            "type": "visual_python_manim_direction_constant",
                                            "fields": {
                                              "VALUE": "UP"
                                            }
                                          }
                                        },
                                        "BUFF": {
                                          "block": {
                                            "type": "math_number",
                                            "fields": {
                                              "NUM": 0.3
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "next": {
                                  "block": {
                                    "type": "visual_python_manim_assign",
                                    "fields": {
                                      "VAR": "origin_label"
                                    },
                                    "inputs": {
                                      "MOBJECT": {
                                        "block": {
                                          "type": "visual_python_manim_next_to",
                                          "inputs": {
                                            "MOBJECT": {
                                              "block": {
                                                "type": "python_new_object_structured",
                                                "fields": {
                                                  "TARGET": "Text",
                                                  "ARG_NAME1": "font_size",
                                                  "ARG_NAME2": "color"
                                                },
                                                "extraState": {
                                                  "arguments": [
                                                    {
                                                      "kind": "positional",
                                                      "name": "name"
                                                    },
                                                    {
                                                      "kind": "keyword",
                                                      "name": "font_size"
                                                    },
                                                    {
                                                      "kind": "keyword",
                                                      "name": "color"
                                                    }
                                                  ]
                                                },
                                                "inputs": {
                                                  "ARG0": {
                                                    "block": {
                                                      "type": "text",
                                                      "fields": {
                                                        "TEXT": "O"
                                                      }
                                                    }
                                                  },
                                                  "ARG1": {
                                                    "block": {
                                                      "type": "math_number",
                                                      "fields": {
                                                        "NUM": 20
                                                      }
                                                    }
                                                  },
                                                  "ARG2": {
                                                    "block": {
                                                      "type": "visual_python_manim_color_constant",
                                                      "fields": {
                                                        "VALUE": "WHITE"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            },
                                            "TARGET": {
                                              "block": {
                                                "type": "python_call_structured",
                                                "fields": {
                                                  "TARGET": "coords.coords_to_point"
                                                },
                                                "extraState": {
                                                  "arguments": [
                                                    {
                                                      "kind": "positional",
                                                      "name": "name"
                                                    },
                                                    {
                                                      "kind": "positional",
                                                      "name": "name"
                                                    }
                                                  ]
                                                },
                                                "inputs": {
                                                  "ARG0": {
                                                    "block": {
                                                      "type": "math_number",
                                                      "fields": {
                                                        "NUM": 0
                                                      }
                                                    }
                                                  },
                                                  "ARG1": {
                                                    "block": {
                                                      "type": "math_number",
                                                      "fields": {
                                                        "NUM": 0
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            },
                                            "DIRECTION": {
                                              "block": {
                                                "type": "visual_python_manim_direction_constant",
                                                "fields": {
                                                  "VALUE": "DL"
                                                }
                                              }
                                            },
                                            "BUFF": {
                                              "block": {
                                                "type": "math_number",
                                                "fields": {
                                                  "NUM": 0.2
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "next": {
                                      "block": {
                                        "type": "python_call_statement_structured",
                                        "fields": {
                                          "TARGET": "self.play",
                                          "ARG_NAME1": "run_time"
                                        },
                                        "extraState": {
                                          "arguments": [
                                            {
                                              "kind": "positional",
                                              "name": "name"
                                            },
                                            {
                                              "kind": "keyword",
                                              "name": "run_time"
                                            }
                                          ]
                                        },
                                        "inputs": {
                                          "ARG0": {
                                            "block": {
                                              "type": "python_call_structured",
                                              "fields": {
                                                "TARGET": "Write"
                                              },
                                              "extraState": {
                                                "arguments": [
                                                  {
                                                    "kind": "positional",
                                                    "name": "name"
                                                  }
                                                ]
                                              },
                                              "inputs": {
                                                "ARG0": {
                                                  "block": {
                                                    "type": "python_new_object_structured",
                                                    "fields": {
                                                      "TARGET": "VGroup"
                                                    },
                                                    "extraState": {
                                                      "arguments": [
                                                        {
                                                          "kind": "positional",
                                                          "name": "name"
                                                        },
                                                        {
                                                          "kind": "positional",
                                                          "name": "name"
                                                        },
                                                        {
                                                          "kind": "positional",
                                                          "name": "name"
                                                        }
                                                      ]
                                                    },
                                                    "inputs": {
                                                      "ARG0": {
                                                        "block": {
                                                          "type": "variables_get",
                                                          "fields": {
                                                            "VAR": {
                                                              "name": "x_label"
                                                            }
                                                          }
                                                        }
                                                      },
                                                      "ARG1": {
                                                        "block": {
                                                          "type": "variables_get",
                                                          "fields": {
                                                            "VAR": {
                                                              "name": "y_label"
                                                            }
                                                          }
                                                        }
                                                      },
                                                      "ARG2": {
                                                        "block": {
                                                          "type": "variables_get",
                                                          "fields": {
                                                            "VAR": {
                                                              "name": "origin_label"
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "ARG1": {
                                            "block": {
                                              "type": "math_number",
                                              "fields": {
                                                "NUM": 1
                                              }
                                            }
                                          }
                                        },
                                        "next": {
                                          "block": {
                                            "type": "visual_python_manim_wait",
                                            "inputs": {
                                              "SECONDS": {
                                                "block": {
                                                  "type": "math_number",
                                                  "fields": {
                                                    "NUM": 1
                                                  }
                                                }
                                              }
                                            },
                                            "next": {
                                              "block": {
                                                "type": "visual_python_manim_assign",
                                                "fields": {
                                                  "VAR": "title"
                                                },
                                                "inputs": {
                                                  "MOBJECT": {
                                                    "block": {
                                                      "type": "visual_python_manim_shift",
                                                      "inputs": {
                                                        "MOBJECT": {
                                                          "block": {
                                                            "type": "visual_python_manim_to_edge",
                                                            "inputs": {
                                                              "MOBJECT": {
                                                                "block": {
                                                                  "type": "python_new_object_structured",
                                                                  "fields": {
                                                                    "TARGET": "MathTex",
                                                                    "ARG_NAME1": "font_size"
                                                                  },
                                                                  "extraState": {
                                                                    "arguments": [
                                                                      {
                                                                        "kind": "positional",
                                                                        "name": "name"
                                                                      },
                                                                      {
                                                                        "kind": "keyword",
                                                                        "name": "font_size"
                                                                      }
                                                                    ]
                                                                  },
                                                                  "inputs": {
                                                                    "ARG0": {
                                                                      "block": {
                                                                        "type": "text",
                                                                        "fields": {
                                                                          "TEXT": "y = kx + b"
                                                                        }
                                                                      }
                                                                    },
                                                                    "ARG1": {
                                                                      "block": {
                                                                        "type": "math_number",
                                                                        "fields": {
                                                                          "NUM": 32
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              },
                                                              "DIRECTION": {
                                                                "block": {
                                                                  "type": "visual_python_manim_direction_constant",
                                                                  "fields": {
                                                                    "VALUE": "UP"
                                                                  }
                                                                }
                                                              },
                                                              "BUFF": {
                                                                "block": {
                                                                  "type": "math_number",
                                                                  "fields": {
                                                                    "NUM": 0.5
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        },
                                                        "VECTOR": {
                                                          "block": {
                                                            "type": "math_arithmetic",
                                                            "fields": {
                                                              "OP": "ADD"
                                                            },
                                                            "inputs": {
                                                              "A": {
                                                                "block": {
                                                                  "type": "visual_python_manim_scaled_direction",
                                                                  "fields": {
                                                                    "DIRECTION": "LEFT"
                                                                  },
                                                                  "inputs": {
                                                                    "SCALE": {
                                                                      "block": {
                                                                        "type": "math_number",
                                                                        "fields": {
                                                                          "NUM": 4
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              },
                                                              "B": {
                                                                "block": {
                                                                  "type": "visual_python_manim_scaled_direction",
                                                                  "fields": {
                                                                    "DIRECTION": "DOWN"
                                                                  },
                                                                  "inputs": {
                                                                    "SCALE": {
                                                                      "block": {
                                                                        "type": "math_number",
                                                                        "fields": {
                                                                          "NUM": 1
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "next": {
                                                  "block": {
                                                    "type": "visual_python_manim_assign",
                                                    "fields": {
                                                      "VAR": "k_explain"
                                                    },
                                                    "inputs": {
                                                      "MOBJECT": {
                                                        "block": {
                                                          "type": "visual_python_manim_next_to",
                                                          "inputs": {
                                                            "MOBJECT": {
                                                              "block": {
                                                                "type": "python_new_object_structured",
                                                                "fields": {
                                                                  "TARGET": "Text",
                                                                  "ARG_NAME1": "font_size",
                                                                  "ARG_NAME2": "t2c"
                                                                },
                                                                "extraState": {
                                                                  "arguments": [
                                                                    {
                                                                      "kind": "positional",
                                                                      "name": "name"
                                                                    },
                                                                    {
                                                                      "kind": "keyword",
                                                                      "name": "font_size"
                                                                    },
                                                                    {
                                                                      "kind": "keyword",
                                                                      "name": "t2c"
                                                                    }
                                                                  ]
                                                                },
                                                                "inputs": {
                                                                  "ARG0": {
                                                                    "block": {
                                                                      "type": "text",
                                                                      "fields": {
                                                                        "TEXT": "k：斜率，决定直线的倾斜程度和方向"
                                                                      }
                                                                    }
                                                                  },
                                                                  "ARG1": {
                                                                    "block": {
                                                                      "type": "math_number",
                                                                      "fields": {
                                                                        "NUM": 24
                                                                      }
                                                                    }
                                                                  },
                                                                  "ARG2": {
                                                                    "block": {
                                                                      "type": "python_dynamic_dict",
                                                                      "extraState": {
                                                                        "itemCount": 1
                                                                      },
                                                                      "inputs": {
                                                                        "KEY0": {
                                                                          "block": {
                                                                            "type": "text",
                                                                            "fields": {
                                                                              "TEXT": "k"
                                                                            }
                                                                          }
                                                                        },
                                                                        "VALUE0": {
                                                                          "block": {
                                                                            "type": "visual_python_manim_color_constant",
                                                                            "fields": {
                                                                              "VALUE": "BLUE"
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            },
                                                            "TARGET": {
                                                              "block": {
                                                                "type": "variables_get",
                                                                "fields": {
                                                                  "VAR": {
                                                                    "name": "title"
                                                                  }
                                                                }
                                                              }
                                                            },
                                                            "DIRECTION": {
                                                              "block": {
                                                                "type": "visual_python_manim_direction_constant",
                                                                "fields": {
                                                                  "VALUE": "DOWN"
                                                                }
                                                              }
                                                            },
                                                            "BUFF": {
                                                              "block": {
                                                                "type": "math_number",
                                                                "fields": {
                                                                  "NUM": 1.5
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    },
                                                    "next": {
                                                      "block": {
                                                        "type": "visual_python_manim_assign",
                                                        "fields": {
                                                          "VAR": "b_explain"
                                                        },
                                                        "inputs": {
                                                          "MOBJECT": {
                                                            "block": {
                                                              "type": "visual_python_manim_next_to",
                                                              "inputs": {
                                                                "MOBJECT": {
                                                                  "block": {
                                                                    "type": "python_new_object_structured",
                                                                    "fields": {
                                                                      "TARGET": "Text",
                                                                      "ARG_NAME1": "font_size",
                                                                      "ARG_NAME2": "t2c"
                                                                    },
                                                                    "extraState": {
                                                                      "arguments": [
                                                                        {
                                                                          "kind": "positional",
                                                                          "name": "name"
                                                                        },
                                                                        {
                                                                          "kind": "keyword",
                                                                          "name": "font_size"
                                                                        },
                                                                        {
                                                                          "kind": "keyword",
                                                                          "name": "t2c"
                                                                        }
                                                                      ]
                                                                    },
                                                                    "inputs": {
                                                                      "ARG0": {
                                                                        "block": {
                                                                          "type": "text",
                                                                          "fields": {
                                                                            "TEXT": "b：截距，决定直线与y轴交点为(0, b)"
                                                                          }
                                                                        }
                                                                      },
                                                                      "ARG1": {
                                                                        "block": {
                                                                          "type": "math_number",
                                                                          "fields": {
                                                                            "NUM": 24
                                                                          }
                                                                        }
                                                                      },
                                                                      "ARG2": {
                                                                        "block": {
                                                                          "type": "python_dynamic_dict",
                                                                          "extraState": {
                                                                            "itemCount": 1
                                                                          },
                                                                          "inputs": {
                                                                            "KEY0": {
                                                                              "block": {
                                                                                "type": "text",
                                                                                "fields": {
                                                                                  "TEXT": "b"
                                                                                }
                                                                              }
                                                                            },
                                                                            "VALUE0": {
                                                                              "block": {
                                                                                "type": "visual_python_manim_color_constant",
                                                                                "fields": {
                                                                                  "VALUE": "RED"
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                },
                                                                "TARGET": {
                                                                  "block": {
                                                                    "type": "variables_get",
                                                                    "fields": {
                                                                      "VAR": {
                                                                        "name": "k_explain"
                                                                      }
                                                                    }
                                                                  }
                                                                },
                                                                "DIRECTION": {
                                                                  "block": {
                                                                    "type": "visual_python_manim_direction_constant",
                                                                    "fields": {
                                                                      "VALUE": "DOWN"
                                                                    }
                                                                  }
                                                                },
                                                                "BUFF": {
                                                                  "block": {
                                                                    "type": "math_number",
                                                                    "fields": {
                                                                      "NUM": 1
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        },
                                                        "next": {
                                                          "block": {
                                                            "type": "python_call_statement_structured",
                                                            "fields": {
                                                              "TARGET": "self.play",
                                                              "ARG_NAME1": "run_time"
                                                            },
                                                            "extraState": {
                                                              "arguments": [
                                                                {
                                                                  "kind": "positional",
                                                                  "name": "name"
                                                                },
                                                                {
                                                                  "kind": "keyword",
                                                                  "name": "run_time"
                                                                }
                                                              ]
                                                            },
                                                            "inputs": {
                                                              "ARG0": {
                                                                "block": {
                                                                  "type": "python_call_structured",
                                                                  "fields": {
                                                                    "TARGET": "Write"
                                                                  },
                                                                  "extraState": {
                                                                    "arguments": [
                                                                      {
                                                                        "kind": "positional",
                                                                        "name": "name"
                                                                      }
                                                                    ]
                                                                  },
                                                                  "inputs": {
                                                                    "ARG0": {
                                                                      "block": {
                                                                        "type": "variables_get",
                                                                        "fields": {
                                                                          "VAR": {
                                                                            "name": "title"
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              },
                                                              "ARG1": {
                                                                "block": {
                                                                  "type": "math_number",
                                                                  "fields": {
                                                                    "NUM": 1.5
                                                                  }
                                                                }
                                                              }
                                                            },
                                                            "next": {
                                                              "block": {
                                                                "type": "python_call_statement_structured",
                                                                "fields": {
                                                                  "TARGET": "self.play",
                                                                  "ARG_NAME1": "run_time"
                                                                },
                                                                "extraState": {
                                                                  "arguments": [
                                                                    {
                                                                      "kind": "positional",
                                                                      "name": "name"
                                                                    },
                                                                    {
                                                                      "kind": "keyword",
                                                                      "name": "run_time"
                                                                    }
                                                                  ]
                                                                },
                                                                "inputs": {
                                                                  "ARG0": {
                                                                    "block": {
                                                                      "type": "python_call_structured",
                                                                      "fields": {
                                                                        "TARGET": "Write"
                                                                      },
                                                                      "extraState": {
                                                                        "arguments": [
                                                                          {
                                                                            "kind": "positional",
                                                                            "name": "name"
                                                                          }
                                                                        ]
                                                                      },
                                                                      "inputs": {
                                                                        "ARG0": {
                                                                          "block": {
                                                                            "type": "variables_get",
                                                                            "fields": {
                                                                              "VAR": {
                                                                                "name": "k_explain"
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  },
                                                                  "ARG1": {
                                                                    "block": {
                                                                      "type": "math_number",
                                                                      "fields": {
                                                                        "NUM": 1.5
                                                                      }
                                                                    }
                                                                  }
                                                                },
                                                                "next": {
                                                                  "block": {
                                                                    "type": "python_call_statement_structured",
                                                                    "fields": {
                                                                      "TARGET": "self.play",
                                                                      "ARG_NAME1": "run_time"
                                                                    },
                                                                    "extraState": {
                                                                      "arguments": [
                                                                        {
                                                                          "kind": "positional",
                                                                          "name": "name"
                                                                        },
                                                                        {
                                                                          "kind": "keyword",
                                                                          "name": "run_time"
                                                                        }
                                                                      ]
                                                                    },
                                                                    "inputs": {
                                                                      "ARG0": {
                                                                        "block": {
                                                                          "type": "python_call_structured",
                                                                          "fields": {
                                                                            "TARGET": "Write"
                                                                          },
                                                                          "extraState": {
                                                                            "arguments": [
                                                                              {
                                                                                "kind": "positional",
                                                                                "name": "name"
                                                                              }
                                                                            ]
                                                                          },
                                                                          "inputs": {
                                                                            "ARG0": {
                                                                              "block": {
                                                                                "type": "variables_get",
                                                                                "fields": {
                                                                                  "VAR": {
                                                                                    "name": "b_explain"
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      },
                                                                      "ARG1": {
                                                                        "block": {
                                                                          "type": "math_number",
                                                                          "fields": {
                                                                            "NUM": 1.5
                                                                          }
                                                                        }
                                                                      }
                                                                    },
                                                                    "next": {
                                                                      "block": {
                                                                        "type": "visual_python_manim_wait",
                                                                        "inputs": {
                                                                          "SECONDS": {
                                                                            "block": {
                                                                              "type": "math_number",
                                                                              "fields": {
                                                                                "NUM": 2
                                                                              }
                                                                            }
                                                                          }
                                                                        },
                                                                        "next": {
                                                                          "block": {
                                                                            "type": "python_call_statement_structured",
                                                                            "fields": {
                                                                              "TARGET": "self.play",
                                                                              "ARG_NAME1": "run_time"
                                                                            },
                                                                            "extraState": {
                                                                              "arguments": [
                                                                                {
                                                                                  "kind": "positional",
                                                                                  "name": "name"
                                                                                },
                                                                                {
                                                                                  "kind": "keyword",
                                                                                  "name": "run_time"
                                                                                }
                                                                              ]
                                                                            },
                                                                            "inputs": {
                                                                              "ARG0": {
                                                                                "block": {
                                                                                  "type": "python_call_structured",
                                                                                  "fields": {
                                                                                    "TARGET": "FadeOut"
                                                                                  },
                                                                                  "extraState": {
                                                                                    "arguments": [
                                                                                      {
                                                                                        "kind": "positional",
                                                                                        "name": "name"
                                                                                      },
                                                                                      {
                                                                                        "kind": "positional",
                                                                                        "name": "name"
                                                                                      },
                                                                                      {
                                                                                        "kind": "positional",
                                                                                        "name": "name"
                                                                                      }
                                                                                    ]
                                                                                  },
                                                                                  "inputs": {
                                                                                    "ARG0": {
                                                                                      "block": {
                                                                                        "type": "variables_get",
                                                                                        "fields": {
                                                                                          "VAR": {
                                                                                            "name": "title"
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    },
                                                                                    "ARG1": {
                                                                                      "block": {
                                                                                        "type": "variables_get",
                                                                                        "fields": {
                                                                                          "VAR": {
                                                                                            "name": "k_explain"
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    },
                                                                                    "ARG2": {
                                                                                      "block": {
                                                                                        "type": "variables_get",
                                                                                        "fields": {
                                                                                          "VAR": {
                                                                                            "name": "b_explain"
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              },
                                                                              "ARG1": {
                                                                                "block": {
                                                                                  "type": "math_number",
                                                                                  "fields": {
                                                                                    "NUM": 1
                                                                                  }
                                                                                }
                                                                              }
                                                                            },
                                                                            "next": {
                                                                              "block": {
                                                                                "type": "visual_python_manim_assign",
                                                                                "fields": {
                                                                                  "VAR": "k_title"
                                                                                },
                                                                                "inputs": {
                                                                                  "MOBJECT": {
                                                                                    "block": {
                                                                                      "type": "visual_python_manim_shift",
                                                                                      "inputs": {
                                                                                        "MOBJECT": {
                                                                                          "block": {
                                                                                            "type": "visual_python_manim_to_edge",
                                                                                            "inputs": {
                                                                                              "MOBJECT": {
                                                                                                "block": {
                                                                                                  "type": "python_new_object_structured",
                                                                                                  "fields": {
                                                                                                    "TARGET": "Text",
                                                                                                    "ARG_NAME1": "font_size"
                                                                                                  },
                                                                                                  "extraState": {
                                                                                                    "arguments": [
                                                                                                      {
                                                                                                        "kind": "positional",
                                                                                                        "name": "name"
                                                                                                      },
                                                                                                      {
                                                                                                        "kind": "keyword",
                                                                                                        "name": "font_size"
                                                                                                      }
                                                                                                    ]
                                                                                                  },
                                                                                                  "inputs": {
                                                                                                    "ARG0": {
                                                                                                      "block": {
                                                                                                        "type": "text",
                                                                                                        "fields": {
                                                                                                          "TEXT": "改变斜率k（固定b=1）"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "ARG1": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": 28
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              },
                                                                                              "DIRECTION": {
                                                                                                "block": {
                                                                                                  "type": "visual_python_manim_direction_constant",
                                                                                                  "fields": {
                                                                                                    "VALUE": "UP"
                                                                                                  }
                                                                                                }
                                                                                              },
                                                                                              "BUFF": {
                                                                                                "block": {
                                                                                                  "type": "math_number",
                                                                                                  "fields": {
                                                                                                    "NUM": 0.5
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        },
                                                                                        "VECTOR": {
                                                                                          "block": {
                                                                                            "type": "visual_python_manim_scaled_direction",
                                                                                            "fields": {
                                                                                              "DIRECTION": "LEFT"
                                                                                            },
                                                                                            "inputs": {
                                                                                              "SCALE": {
                                                                                                "block": {
                                                                                                  "type": "math_number",
                                                                                                  "fields": {
                                                                                                    "NUM": 4
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                },
                                                                                "next": {
                                                                                  "block": {
                                                                                    "type": "python_call_statement_structured",
                                                                                    "fields": {
                                                                                      "TARGET": "self.play",
                                                                                      "ARG_NAME1": "run_time"
                                                                                    },
                                                                                    "extraState": {
                                                                                      "arguments": [
                                                                                        {
                                                                                          "kind": "positional",
                                                                                          "name": "name"
                                                                                        },
                                                                                        {
                                                                                          "kind": "keyword",
                                                                                          "name": "run_time"
                                                                                        }
                                                                                      ]
                                                                                    },
                                                                                    "inputs": {
                                                                                      "ARG0": {
                                                                                        "block": {
                                                                                          "type": "python_call_structured",
                                                                                          "fields": {
                                                                                            "TARGET": "Write"
                                                                                          },
                                                                                          "extraState": {
                                                                                            "arguments": [
                                                                                              {
                                                                                                "kind": "positional",
                                                                                                "name": "name"
                                                                                              }
                                                                                            ]
                                                                                          },
                                                                                          "inputs": {
                                                                                            "ARG0": {
                                                                                              "block": {
                                                                                                "type": "variables_get",
                                                                                                "fields": {
                                                                                                  "VAR": {
                                                                                                    "name": "k_title"
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      },
                                                                                      "ARG1": {
                                                                                        "block": {
                                                                                          "type": "math_number",
                                                                                          "fields": {
                                                                                            "NUM": 1
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    },
                                                                                    "next": {
                                                                                      "block": {
                                                                                        "type": "variables_set",
                                                                                        "fields": {
                                                                                          "VAR": {
                                                                                            "name": "k_values"
                                                                                          }
                                                                                        },
                                                                                        "inputs": {
                                                                                          "VALUE": {
                                                                                            "block": {
                                                                                              "type": "python_list_collection",
                                                                                              "extraState": {
                                                                                                "itemCount": 5
                                                                                              },
                                                                                              "inputs": {
                                                                                                "ITEM0": {
                                                                                                  "block": {
                                                                                                    "type": "math_number",
                                                                                                    "fields": {
                                                                                                      "NUM": 0
                                                                                                    }
                                                                                                  }
                                                                                                },
                                                                                                "ITEM1": {
                                                                                                  "block": {
                                                                                                    "type": "math_number",
                                                                                                    "fields": {
                                                                                                      "NUM": 1
                                                                                                    }
                                                                                                  }
                                                                                                },
                                                                                                "ITEM2": {
                                                                                                  "block": {
                                                                                                    "type": "math_number",
                                                                                                    "fields": {
                                                                                                      "NUM": 2
                                                                                                    }
                                                                                                  }
                                                                                                },
                                                                                                "ITEM3": {
                                                                                                  "block": {
                                                                                                    "type": "math_number",
                                                                                                    "fields": {
                                                                                                      "NUM": -1
                                                                                                    }
                                                                                                  }
                                                                                                },
                                                                                                "ITEM4": {
                                                                                                  "block": {
                                                                                                    "type": "math_number",
                                                                                                    "fields": {
                                                                                                      "NUM": -2
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        },
                                                                                        "next": {
                                                                                          "block": {
                                                                                            "type": "variables_set",
                                                                                            "fields": {
                                                                                              "VAR": {
                                                                                                "name": "k_colors"
                                                                                              }
                                                                                            },
                                                                                            "inputs": {
                                                                                              "VALUE": {
                                                                                                "block": {
                                                                                                  "type": "python_dynamic_dict",
                                                                                                  "extraState": {
                                                                                                    "itemCount": 5
                                                                                                  },
                                                                                                  "inputs": {
                                                                                                    "KEY0": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": 0
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "VALUE0": {
                                                                                                      "block": {
                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                        "fields": {
                                                                                                          "VALUE": "GREEN"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "KEY1": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": 1
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "VALUE1": {
                                                                                                      "block": {
                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                        "fields": {
                                                                                                          "VALUE": "RED"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "KEY2": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": 2
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "VALUE2": {
                                                                                                      "block": {
                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                        "fields": {
                                                                                                          "VALUE": "ORANGE"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "KEY3": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": -1
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "VALUE3": {
                                                                                                      "block": {
                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                        "fields": {
                                                                                                          "VALUE": "PURPLE"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "KEY4": {
                                                                                                      "block": {
                                                                                                        "type": "math_number",
                                                                                                        "fields": {
                                                                                                          "NUM": -2
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "VALUE4": {
                                                                                                      "block": {
                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                        "fields": {
                                                                                                          "VALUE": "TEAL"
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            },
                                                                                            "next": {
                                                                                              "block": {
                                                                                                "type": "variables_set",
                                                                                                "fields": {
                                                                                                  "VAR": {
                                                                                                    "name": "current_line"
                                                                                                  }
                                                                                                },
                                                                                                "inputs": {
                                                                                                  "VALUE": {
                                                                                                    "block": {
                                                                                                      "type": "python_none"
                                                                                                    }
                                                                                                  }
                                                                                                },
                                                                                                "next": {
                                                                                                  "block": {
                                                                                                    "type": "variables_set",
                                                                                                    "fields": {
                                                                                                      "VAR": {
                                                                                                        "name": "current_label"
                                                                                                      }
                                                                                                    },
                                                                                                    "inputs": {
                                                                                                      "VALUE": {
                                                                                                        "block": {
                                                                                                          "type": "python_none"
                                                                                                        }
                                                                                                      }
                                                                                                    },
                                                                                                    "next": {
                                                                                                      "block": {
                                                                                                        "type": "python_for_in",
                                                                                                        "fields": {
                                                                                                          "VAR": {
                                                                                                            "name": "k"
                                                                                                          }
                                                                                                        },
                                                                                                        "inputs": {
                                                                                                          "ITERABLE": {
                                                                                                            "block": {
                                                                                                              "type": "variables_get",
                                                                                                              "fields": {
                                                                                                                "VAR": {
                                                                                                                  "name": "k_values"
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          },
                                                                                                          "DO": {
                                                                                                            "block": {
                                                                                                              "type": "controls_if",
                                                                                                              "extraState": {
                                                                                                                "elseIfCount": 0,
                                                                                                                "hasElse": false
                                                                                                              },
                                                                                                              "inputs": {
                                                                                                                "IF0": {
                                                                                                                  "block": {
                                                                                                                    "type": "logic_operation",
                                                                                                                    "fields": {
                                                                                                                      "OP": "AND"
                                                                                                                    },
                                                                                                                    "inputs": {
                                                                                                                      "A": {
                                                                                                                        "block": {
                                                                                                                          "type": "variables_get",
                                                                                                                          "fields": {
                                                                                                                            "VAR": {
                                                                                                                              "name": "current_line"
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      },
                                                                                                                      "B": {
                                                                                                                        "block": {
                                                                                                                          "type": "variables_get",
                                                                                                                          "fields": {
                                                                                                                            "VAR": {
                                                                                                                              "name": "current_label"
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                },
                                                                                                                "DO0": {
                                                                                                                  "block": {
                                                                                                                    "type": "python_call_statement_structured",
                                                                                                                    "fields": {
                                                                                                                      "TARGET": "self.play",
                                                                                                                      "ARG_NAME1": "run_time"
                                                                                                                    },
                                                                                                                    "extraState": {
                                                                                                                      "arguments": [
                                                                                                                        {
                                                                                                                          "kind": "positional",
                                                                                                                          "name": "name"
                                                                                                                        },
                                                                                                                        {
                                                                                                                          "kind": "keyword",
                                                                                                                          "name": "run_time"
                                                                                                                        }
                                                                                                                      ]
                                                                                                                    },
                                                                                                                    "inputs": {
                                                                                                                      "ARG0": {
                                                                                                                        "block": {
                                                                                                                          "type": "python_call_structured",
                                                                                                                          "fields": {
                                                                                                                            "TARGET": "FadeOut"
                                                                                                                          },
                                                                                                                          "extraState": {
                                                                                                                            "arguments": [
                                                                                                                              {
                                                                                                                                "kind": "positional",
                                                                                                                                "name": "name"
                                                                                                                              },
                                                                                                                              {
                                                                                                                                "kind": "positional",
                                                                                                                                "name": "name"
                                                                                                                              }
                                                                                                                            ]
                                                                                                                          },
                                                                                                                          "inputs": {
                                                                                                                            "ARG0": {
                                                                                                                              "block": {
                                                                                                                                "type": "variables_get",
                                                                                                                                "fields": {
                                                                                                                                  "VAR": {
                                                                                                                                    "name": "current_line"
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            },
                                                                                                                            "ARG1": {
                                                                                                                              "block": {
                                                                                                                                "type": "variables_get",
                                                                                                                                "fields": {
                                                                                                                                  "VAR": {
                                                                                                                                    "name": "current_label"
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      },
                                                                                                                      "ARG1": {
                                                                                                                        "block": {
                                                                                                                          "type": "math_number",
                                                                                                                          "fields": {
                                                                                                                            "NUM": 0.8
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              },
                                                                                                              "next": {
                                                                                                                "block": {
                                                                                                                  "type": "python_function_structured",
                                                                                                                  "fields": {
                                                                                                                    "NAME": "func",
                                                                                                                    "PARAM_NAME0": "x"
                                                                                                                  },
                                                                                                                  "extraState": {
                                                                                                                    "parameters": [
                                                                                                                      {
                                                                                                                        "kind": "positional",
                                                                                                                        "name": "x"
                                                                                                                      }
                                                                                                                    ]
                                                                                                                  },
                                                                                                                  "inputs": {
                                                                                                                    "BODY": {
                                                                                                                      "block": {
                                                                                                                        "type": "python_return",
                                                                                                                        "inputs": {
                                                                                                                          "VALUE": {
                                                                                                                            "block": {
                                                                                                                              "type": "math_arithmetic",
                                                                                                                              "fields": {
                                                                                                                                "OP": "ADD"
                                                                                                                              },
                                                                                                                              "inputs": {
                                                                                                                                "A": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_arithmetic",
                                                                                                                                    "fields": {
                                                                                                                                      "OP": "MULTIPLY"
                                                                                                                                    },
                                                                                                                                    "inputs": {
                                                                                                                                      "A": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "variables_get",
                                                                                                                                          "fields": {
                                                                                                                                            "VAR": {
                                                                                                                                              "name": "k"
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      },
                                                                                                                                      "B": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "variables_get",
                                                                                                                                          "fields": {
                                                                                                                                            "VAR": {
                                                                                                                                              "name": "x"
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "B": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": 1
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  },
                                                                                                                  "next": {
                                                                                                                    "block": {
                                                                                                                      "type": "visual_python_manim_assign",
                                                                                                                      "fields": {
                                                                                                                        "VAR": "line"
                                                                                                                      },
                                                                                                                      "inputs": {
                                                                                                                        "MOBJECT": {
                                                                                                                          "block": {
                                                                                                                            "type": "python_call_structured",
                                                                                                                            "fields": {
                                                                                                                              "TARGET": "coords.plot",
                                                                                                                              "ARG_NAME1": "x_range",
                                                                                                                              "ARG_NAME2": "color",
                                                                                                                              "ARG_NAME3": "stroke_width"
                                                                                                                            },
                                                                                                                            "extraState": {
                                                                                                                              "arguments": [
                                                                                                                                {
                                                                                                                                  "kind": "positional",
                                                                                                                                  "name": "name"
                                                                                                                                },
                                                                                                                                {
                                                                                                                                  "kind": "keyword",
                                                                                                                                  "name": "x_range"
                                                                                                                                },
                                                                                                                                {
                                                                                                                                  "kind": "keyword",
                                                                                                                                  "name": "color"
                                                                                                                                },
                                                                                                                                {
                                                                                                                                  "kind": "keyword",
                                                                                                                                  "name": "stroke_width"
                                                                                                                                }
                                                                                                                              ]
                                                                                                                            },
                                                                                                                            "inputs": {
                                                                                                                              "ARG0": {
                                                                                                                                "block": {
                                                                                                                                  "type": "variables_get",
                                                                                                                                  "fields": {
                                                                                                                                    "VAR": {
                                                                                                                                      "name": "func"
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "ARG1": {
                                                                                                                                "block": {
                                                                                                                                  "type": "python_list_collection",
                                                                                                                                  "extraState": {
                                                                                                                                    "itemCount": 2
                                                                                                                                  },
                                                                                                                                  "inputs": {
                                                                                                                                    "ITEM0": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "math_number",
                                                                                                                                        "fields": {
                                                                                                                                          "NUM": -6
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "ITEM1": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "math_number",
                                                                                                                                        "fields": {
                                                                                                                                          "NUM": 6
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "ARG2": {
                                                                                                                                "block": {
                                                                                                                                  "type": "python_index",
                                                                                                                                  "inputs": {
                                                                                                                                    "OBJECT": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_get",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "k_colors"
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "INDEX": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_get",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "k"
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "ARG3": {
                                                                                                                                "block": {
                                                                                                                                  "type": "math_number",
                                                                                                                                  "fields": {
                                                                                                                                    "NUM": 3
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      },
                                                                                                                      "next": {
                                                                                                                        "block": {
                                                                                                                          "type": "variables_set",
                                                                                                                          "fields": {
                                                                                                                            "VAR": {
                                                                                                                              "name": "label_y_pos"
                                                                                                                            }
                                                                                                                          },
                                                                                                                          "inputs": {
                                                                                                                            "VALUE": {
                                                                                                                              "block": {
                                                                                                                                "type": "python_conditional",
                                                                                                                                "inputs": {
                                                                                                                                  "CONDITION": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "logic_compare",
                                                                                                                                      "fields": {
                                                                                                                                        "OP": "GTE"
                                                                                                                                      },
                                                                                                                                      "inputs": {
                                                                                                                                        "A": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "variables_get",
                                                                                                                                            "fields": {
                                                                                                                                              "VAR": {
                                                                                                                                                "name": "k"
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "B": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "math_number",
                                                                                                                                            "fields": {
                                                                                                                                              "NUM": 0
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  },
                                                                                                                                  "TRUE_VALUE": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "math_number",
                                                                                                                                      "fields": {
                                                                                                                                        "NUM": 3
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  },
                                                                                                                                  "FALSE_VALUE": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "math_number",
                                                                                                                                      "fields": {
                                                                                                                                        "NUM": -3
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          },
                                                                                                                          "next": {
                                                                                                                            "block": {
                                                                                                                              "type": "variables_set",
                                                                                                                              "fields": {
                                                                                                                                "VAR": {
                                                                                                                                  "name": "label_pos"
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "inputs": {
                                                                                                                                "VALUE": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "python_call_structured",
                                                                                                                                    "fields": {
                                                                                                                                      "TARGET": "coords.coords_to_point"
                                                                                                                                    },
                                                                                                                                    "extraState": {
                                                                                                                                      "arguments": [
                                                                                                                                        {
                                                                                                                                          "kind": "positional",
                                                                                                                                          "name": "name"
                                                                                                                                        },
                                                                                                                                        {
                                                                                                                                          "kind": "positional",
                                                                                                                                          "name": "name"
                                                                                                                                        }
                                                                                                                                      ]
                                                                                                                                    },
                                                                                                                                    "inputs": {
                                                                                                                                      "ARG0": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "math_number",
                                                                                                                                          "fields": {
                                                                                                                                            "NUM": 4
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      },
                                                                                                                                      "ARG1": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "variables_get",
                                                                                                                                          "fields": {
                                                                                                                                            "VAR": {
                                                                                                                                              "name": "label_y_pos"
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "next": {
                                                                                                                                "block": {
                                                                                                                                  "type": "controls_if",
                                                                                                                                  "extraState": {
                                                                                                                                    "elseIfCount": 2,
                                                                                                                                    "hasElse": true
                                                                                                                                  },
                                                                                                                                  "inputs": {
                                                                                                                                    "IF0": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "logic_compare",
                                                                                                                                        "fields": {
                                                                                                                                          "OP": "EQ"
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "A": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "variables_get",
                                                                                                                                              "fields": {
                                                                                                                                                "VAR": {
                                                                                                                                                  "name": "k"
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "B": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "math_number",
                                                                                                                                              "fields": {
                                                                                                                                                "NUM": 0
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "DO0": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_set",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "label_str"
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "VALUE": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "text",
                                                                                                                                              "fields": {
                                                                                                                                                "TEXT": "y = 1"
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "IF1": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "logic_compare",
                                                                                                                                        "fields": {
                                                                                                                                          "OP": "EQ"
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "A": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "variables_get",
                                                                                                                                              "fields": {
                                                                                                                                                "VAR": {
                                                                                                                                                  "name": "k"
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "B": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "math_number",
                                                                                                                                              "fields": {
                                                                                                                                                "NUM": 1
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "DO1": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_set",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "label_str"
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "VALUE": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "text",
                                                                                                                                              "fields": {
                                                                                                                                                "TEXT": "y = x + 1"
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "IF2": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "logic_compare",
                                                                                                                                        "fields": {
                                                                                                                                          "OP": "EQ"
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "A": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "variables_get",
                                                                                                                                              "fields": {
                                                                                                                                                "VAR": {
                                                                                                                                                  "name": "k"
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "B": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "math_number",
                                                                                                                                              "fields": {
                                                                                                                                                "NUM": -1
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "DO2": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_set",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "label_str"
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "VALUE": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "text",
                                                                                                                                              "fields": {
                                                                                                                                                "TEXT": "y = -x + 1"
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "ELSE": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "variables_set",
                                                                                                                                        "fields": {
                                                                                                                                          "VAR": {
                                                                                                                                            "name": "label_str"
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "VALUE": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "python_f_string",
                                                                                                                                              "fields": {
                                                                                                                                                "PREFIX": "y = ",
                                                                                                                                                "FORMAT": "",
                                                                                                                                                "SUFFIX": "x + 1"
                                                                                                                                              },
                                                                                                                                              "inputs": {
                                                                                                                                                "VALUE": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "k"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  },
                                                                                                                                  "next": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "visual_python_manim_assign",
                                                                                                                                      "fields": {
                                                                                                                                        "VAR": "label"
                                                                                                                                      },
                                                                                                                                      "inputs": {
                                                                                                                                        "MOBJECT": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "visual_python_manim_next_to",
                                                                                                                                            "inputs": {
                                                                                                                                              "MOBJECT": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "python_new_object_structured",
                                                                                                                                                  "fields": {
                                                                                                                                                    "TARGET": "MathTex",
                                                                                                                                                    "ARG_NAME1": "font_size"
                                                                                                                                                  },
                                                                                                                                                  "extraState": {
                                                                                                                                                    "arguments": [
                                                                                                                                                      {
                                                                                                                                                        "kind": "positional",
                                                                                                                                                        "name": "name"
                                                                                                                                                      },
                                                                                                                                                      {
                                                                                                                                                        "kind": "keyword",
                                                                                                                                                        "name": "font_size"
                                                                                                                                                      }
                                                                                                                                                    ]
                                                                                                                                                  },
                                                                                                                                                  "inputs": {
                                                                                                                                                    "ARG0": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "variables_get",
                                                                                                                                                        "fields": {
                                                                                                                                                          "VAR": {
                                                                                                                                                            "name": "label_str"
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    },
                                                                                                                                                    "ARG1": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "math_number",
                                                                                                                                                        "fields": {
                                                                                                                                                          "NUM": 24
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "TARGET": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "variables_get",
                                                                                                                                                  "fields": {
                                                                                                                                                    "VAR": {
                                                                                                                                                      "name": "label_pos"
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "DIRECTION": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "visual_python_manim_direction_constant",
                                                                                                                                                  "fields": {
                                                                                                                                                    "VALUE": "RIGHT"
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "BUFF": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "math_number",
                                                                                                                                                  "fields": {
                                                                                                                                                    "NUM": 0.3
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      },
                                                                                                                                      "next": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "python_call_statement_structured",
                                                                                                                                          "fields": {
                                                                                                                                            "TARGET": "self.play",
                                                                                                                                            "ARG_NAME2": "run_time"
                                                                                                                                          },
                                                                                                                                          "extraState": {
                                                                                                                                            "arguments": [
                                                                                                                                              {
                                                                                                                                                "kind": "positional",
                                                                                                                                                "name": "name"
                                                                                                                                              },
                                                                                                                                              {
                                                                                                                                                "kind": "positional",
                                                                                                                                                "name": "name"
                                                                                                                                              },
                                                                                                                                              {
                                                                                                                                                "kind": "keyword",
                                                                                                                                                "name": "run_time"
                                                                                                                                              }
                                                                                                                                            ]
                                                                                                                                          },
                                                                                                                                          "inputs": {
                                                                                                                                            "ARG0": {
                                                                                                                                              "block": {
                                                                                                                                                "type": "python_call_structured",
                                                                                                                                                "fields": {
                                                                                                                                                  "TARGET": "Create"
                                                                                                                                                },
                                                                                                                                                "extraState": {
                                                                                                                                                  "arguments": [
                                                                                                                                                    {
                                                                                                                                                      "kind": "positional",
                                                                                                                                                      "name": "name"
                                                                                                                                                    }
                                                                                                                                                  ]
                                                                                                                                                },
                                                                                                                                                "inputs": {
                                                                                                                                                  "ARG0": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "variables_get",
                                                                                                                                                      "fields": {
                                                                                                                                                        "VAR": {
                                                                                                                                                          "name": "line"
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            },
                                                                                                                                            "ARG1": {
                                                                                                                                              "block": {
                                                                                                                                                "type": "python_call_structured",
                                                                                                                                                "fields": {
                                                                                                                                                  "TARGET": "Write"
                                                                                                                                                },
                                                                                                                                                "extraState": {
                                                                                                                                                  "arguments": [
                                                                                                                                                    {
                                                                                                                                                      "kind": "positional",
                                                                                                                                                      "name": "name"
                                                                                                                                                    }
                                                                                                                                                  ]
                                                                                                                                                },
                                                                                                                                                "inputs": {
                                                                                                                                                  "ARG0": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "variables_get",
                                                                                                                                                      "fields": {
                                                                                                                                                        "VAR": {
                                                                                                                                                          "name": "label"
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            },
                                                                                                                                            "ARG2": {
                                                                                                                                              "block": {
                                                                                                                                                "type": "math_number",
                                                                                                                                                "fields": {
                                                                                                                                                  "NUM": 1.2
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "next": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "variables_set",
                                                                                                                                              "fields": {
                                                                                                                                                "VAR": {
                                                                                                                                                  "name": "current_line"
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "inputs": {
                                                                                                                                                "VALUE": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "line"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "next": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "variables_set",
                                                                                                                                                  "fields": {
                                                                                                                                                    "VAR": {
                                                                                                                                                      "name": "current_label"
                                                                                                                                                    }
                                                                                                                                                  },
                                                                                                                                                  "inputs": {
                                                                                                                                                    "VALUE": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "variables_get",
                                                                                                                                                        "fields": {
                                                                                                                                                          "VAR": {
                                                                                                                                                            "name": "label"
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  },
                                                                                                                                                  "next": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "visual_python_manim_wait",
                                                                                                                                                      "inputs": {
                                                                                                                                                        "SECONDS": {
                                                                                                                                                          "block": {
                                                                                                                                                            "type": "math_number",
                                                                                                                                                            "fields": {
                                                                                                                                                              "NUM": 1
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        },
                                                                                                        "next": {
                                                                                                          "block": {
                                                                                                            "type": "python_call_statement_structured",
                                                                                                            "fields": {
                                                                                                              "TARGET": "self.play",
                                                                                                              "ARG_NAME1": "run_time"
                                                                                                            },
                                                                                                            "extraState": {
                                                                                                              "arguments": [
                                                                                                                {
                                                                                                                  "kind": "positional",
                                                                                                                  "name": "name"
                                                                                                                },
                                                                                                                {
                                                                                                                  "kind": "keyword",
                                                                                                                  "name": "run_time"
                                                                                                                }
                                                                                                              ]
                                                                                                            },
                                                                                                            "inputs": {
                                                                                                              "ARG0": {
                                                                                                                "block": {
                                                                                                                  "type": "python_call_structured",
                                                                                                                  "fields": {
                                                                                                                    "TARGET": "FadeOut"
                                                                                                                  },
                                                                                                                  "extraState": {
                                                                                                                    "arguments": [
                                                                                                                      {
                                                                                                                        "kind": "positional",
                                                                                                                        "name": "name"
                                                                                                                      },
                                                                                                                      {
                                                                                                                        "kind": "positional",
                                                                                                                        "name": "name"
                                                                                                                      },
                                                                                                                      {
                                                                                                                        "kind": "positional",
                                                                                                                        "name": "name"
                                                                                                                      }
                                                                                                                    ]
                                                                                                                  },
                                                                                                                  "inputs": {
                                                                                                                    "ARG0": {
                                                                                                                      "block": {
                                                                                                                        "type": "variables_get",
                                                                                                                        "fields": {
                                                                                                                          "VAR": {
                                                                                                                            "name": "current_line"
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    },
                                                                                                                    "ARG1": {
                                                                                                                      "block": {
                                                                                                                        "type": "variables_get",
                                                                                                                        "fields": {
                                                                                                                          "VAR": {
                                                                                                                            "name": "current_label"
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    },
                                                                                                                    "ARG2": {
                                                                                                                      "block": {
                                                                                                                        "type": "variables_get",
                                                                                                                        "fields": {
                                                                                                                          "VAR": {
                                                                                                                            "name": "k_title"
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              },
                                                                                                              "ARG1": {
                                                                                                                "block": {
                                                                                                                  "type": "math_number",
                                                                                                                  "fields": {
                                                                                                                    "NUM": 1
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            },
                                                                                                            "next": {
                                                                                                              "block": {
                                                                                                                "type": "visual_python_manim_assign",
                                                                                                                "fields": {
                                                                                                                  "VAR": "b_title"
                                                                                                                },
                                                                                                                "inputs": {
                                                                                                                  "MOBJECT": {
                                                                                                                    "block": {
                                                                                                                      "type": "visual_python_manim_shift",
                                                                                                                      "inputs": {
                                                                                                                        "MOBJECT": {
                                                                                                                          "block": {
                                                                                                                            "type": "visual_python_manim_to_edge",
                                                                                                                            "inputs": {
                                                                                                                              "MOBJECT": {
                                                                                                                                "block": {
                                                                                                                                  "type": "python_new_object_structured",
                                                                                                                                  "fields": {
                                                                                                                                    "TARGET": "Text",
                                                                                                                                    "ARG_NAME1": "font_size"
                                                                                                                                  },
                                                                                                                                  "extraState": {
                                                                                                                                    "arguments": [
                                                                                                                                      {
                                                                                                                                        "kind": "positional",
                                                                                                                                        "name": "name"
                                                                                                                                      },
                                                                                                                                      {
                                                                                                                                        "kind": "keyword",
                                                                                                                                        "name": "font_size"
                                                                                                                                      }
                                                                                                                                    ]
                                                                                                                                  },
                                                                                                                                  "inputs": {
                                                                                                                                    "ARG0": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "text",
                                                                                                                                        "fields": {
                                                                                                                                          "TEXT": "改变截距b（固定k=1）"
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "ARG1": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "math_number",
                                                                                                                                        "fields": {
                                                                                                                                          "NUM": 28
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "DIRECTION": {
                                                                                                                                "block": {
                                                                                                                                  "type": "visual_python_manim_direction_constant",
                                                                                                                                  "fields": {
                                                                                                                                    "VALUE": "UP"
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              },
                                                                                                                              "BUFF": {
                                                                                                                                "block": {
                                                                                                                                  "type": "math_number",
                                                                                                                                  "fields": {
                                                                                                                                    "NUM": 0.5
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        },
                                                                                                                        "VECTOR": {
                                                                                                                          "block": {
                                                                                                                            "type": "visual_python_manim_scaled_direction",
                                                                                                                            "fields": {
                                                                                                                              "DIRECTION": "LEFT"
                                                                                                                            },
                                                                                                                            "inputs": {
                                                                                                                              "SCALE": {
                                                                                                                                "block": {
                                                                                                                                  "type": "math_number",
                                                                                                                                  "fields": {
                                                                                                                                    "NUM": 4
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                },
                                                                                                                "next": {
                                                                                                                  "block": {
                                                                                                                    "type": "python_call_statement_structured",
                                                                                                                    "fields": {
                                                                                                                      "TARGET": "self.play",
                                                                                                                      "ARG_NAME1": "run_time"
                                                                                                                    },
                                                                                                                    "extraState": {
                                                                                                                      "arguments": [
                                                                                                                        {
                                                                                                                          "kind": "positional",
                                                                                                                          "name": "name"
                                                                                                                        },
                                                                                                                        {
                                                                                                                          "kind": "keyword",
                                                                                                                          "name": "run_time"
                                                                                                                        }
                                                                                                                      ]
                                                                                                                    },
                                                                                                                    "inputs": {
                                                                                                                      "ARG0": {
                                                                                                                        "block": {
                                                                                                                          "type": "python_call_structured",
                                                                                                                          "fields": {
                                                                                                                            "TARGET": "Write"
                                                                                                                          },
                                                                                                                          "extraState": {
                                                                                                                            "arguments": [
                                                                                                                              {
                                                                                                                                "kind": "positional",
                                                                                                                                "name": "name"
                                                                                                                              }
                                                                                                                            ]
                                                                                                                          },
                                                                                                                          "inputs": {
                                                                                                                            "ARG0": {
                                                                                                                              "block": {
                                                                                                                                "type": "variables_get",
                                                                                                                                "fields": {
                                                                                                                                  "VAR": {
                                                                                                                                    "name": "b_title"
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      },
                                                                                                                      "ARG1": {
                                                                                                                        "block": {
                                                                                                                          "type": "math_number",
                                                                                                                          "fields": {
                                                                                                                            "NUM": 1
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    },
                                                                                                                    "next": {
                                                                                                                      "block": {
                                                                                                                        "type": "variables_set",
                                                                                                                        "fields": {
                                                                                                                          "VAR": {
                                                                                                                            "name": "b_values"
                                                                                                                          }
                                                                                                                        },
                                                                                                                        "inputs": {
                                                                                                                          "VALUE": {
                                                                                                                            "block": {
                                                                                                                              "type": "python_list_collection",
                                                                                                                              "extraState": {
                                                                                                                                "itemCount": 5
                                                                                                                              },
                                                                                                                              "inputs": {
                                                                                                                                "ITEM0": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": 0
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "ITEM1": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": 1
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "ITEM2": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": -1
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "ITEM3": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": 2
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "ITEM4": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "math_number",
                                                                                                                                    "fields": {
                                                                                                                                      "NUM": -2
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        },
                                                                                                                        "next": {
                                                                                                                          "block": {
                                                                                                                            "type": "variables_set",
                                                                                                                            "fields": {
                                                                                                                              "VAR": {
                                                                                                                                "name": "current_elements"
                                                                                                                              }
                                                                                                                            },
                                                                                                                            "inputs": {
                                                                                                                              "VALUE": {
                                                                                                                                "block": {
                                                                                                                                  "type": "python_list_collection",
                                                                                                                                  "extraState": {
                                                                                                                                    "itemCount": 0
                                                                                                                                  },
                                                                                                                                  "inputs": {}
                                                                                                                                }
                                                                                                                              }
                                                                                                                            },
                                                                                                                            "next": {
                                                                                                                              "block": {
                                                                                                                                "type": "python_for_in",
                                                                                                                                "fields": {
                                                                                                                                  "VAR": {
                                                                                                                                    "name": "b"
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "inputs": {
                                                                                                                                  "ITERABLE": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "variables_get",
                                                                                                                                      "fields": {
                                                                                                                                        "VAR": {
                                                                                                                                          "name": "b_values"
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  },
                                                                                                                                  "DO": {
                                                                                                                                    "block": {
                                                                                                                                      "type": "controls_if",
                                                                                                                                      "extraState": {
                                                                                                                                        "elseIfCount": 0,
                                                                                                                                        "hasElse": false
                                                                                                                                      },
                                                                                                                                      "inputs": {
                                                                                                                                        "IF0": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "variables_get",
                                                                                                                                            "fields": {
                                                                                                                                              "VAR": {
                                                                                                                                                "name": "current_elements"
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "DO0": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "python_call_statement_structured",
                                                                                                                                            "fields": {
                                                                                                                                              "TARGET": "self.play",
                                                                                                                                              "ARG_NAME1": "run_time"
                                                                                                                                            },
                                                                                                                                            "extraState": {
                                                                                                                                              "arguments": [
                                                                                                                                                {
                                                                                                                                                  "kind": "positional",
                                                                                                                                                  "name": "name"
                                                                                                                                                },
                                                                                                                                                {
                                                                                                                                                  "kind": "keyword",
                                                                                                                                                  "name": "run_time"
                                                                                                                                                }
                                                                                                                                              ]
                                                                                                                                            },
                                                                                                                                            "inputs": {
                                                                                                                                              "ARG0": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "python_call_structured",
                                                                                                                                                  "fields": {
                                                                                                                                                    "TARGET": "FadeOut"
                                                                                                                                                  },
                                                                                                                                                  "extraState": {
                                                                                                                                                    "arguments": [
                                                                                                                                                      {
                                                                                                                                                        "kind": "star",
                                                                                                                                                        "name": "name"
                                                                                                                                                      }
                                                                                                                                                    ]
                                                                                                                                                  },
                                                                                                                                                  "inputs": {
                                                                                                                                                    "ARG0": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "variables_get",
                                                                                                                                                        "fields": {
                                                                                                                                                          "VAR": {
                                                                                                                                                            "name": "current_elements"
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "ARG1": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "math_number",
                                                                                                                                                  "fields": {
                                                                                                                                                    "NUM": 0.8
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            },
                                                                                                                                            "next": {
                                                                                                                                              "block": {
                                                                                                                                                "type": "python_list_method",
                                                                                                                                                "fields": {
                                                                                                                                                  "METHOD": "clear"
                                                                                                                                                },
                                                                                                                                                "inputs": {
                                                                                                                                                  "LIST": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "variables_get",
                                                                                                                                                      "fields": {
                                                                                                                                                        "VAR": {
                                                                                                                                                          "name": "current_elements"
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      },
                                                                                                                                      "next": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "python_function_structured",
                                                                                                                                          "fields": {
                                                                                                                                            "NAME": "func",
                                                                                                                                            "PARAM_NAME0": "x"
                                                                                                                                          },
                                                                                                                                          "extraState": {
                                                                                                                                            "parameters": [
                                                                                                                                              {
                                                                                                                                                "kind": "positional",
                                                                                                                                                "name": "x"
                                                                                                                                              }
                                                                                                                                            ]
                                                                                                                                          },
                                                                                                                                          "inputs": {
                                                                                                                                            "BODY": {
                                                                                                                                              "block": {
                                                                                                                                                "type": "python_return",
                                                                                                                                                "inputs": {
                                                                                                                                                  "VALUE": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "math_arithmetic",
                                                                                                                                                      "fields": {
                                                                                                                                                        "OP": "ADD"
                                                                                                                                                      },
                                                                                                                                                      "inputs": {
                                                                                                                                                        "A": {
                                                                                                                                                          "block": {
                                                                                                                                                            "type": "variables_get",
                                                                                                                                                            "fields": {
                                                                                                                                                              "VAR": {
                                                                                                                                                                "name": "x"
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        },
                                                                                                                                                        "B": {
                                                                                                                                                          "block": {
                                                                                                                                                            "type": "variables_get",
                                                                                                                                                            "fields": {
                                                                                                                                                              "VAR": {
                                                                                                                                                                "name": "b"
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "next": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "visual_python_manim_assign",
                                                                                                                                              "fields": {
                                                                                                                                                "VAR": "line"
                                                                                                                                              },
                                                                                                                                              "inputs": {
                                                                                                                                                "MOBJECT": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "python_call_structured",
                                                                                                                                                    "fields": {
                                                                                                                                                      "TARGET": "coords.plot",
                                                                                                                                                      "ARG_NAME1": "x_range",
                                                                                                                                                      "ARG_NAME2": "color",
                                                                                                                                                      "ARG_NAME3": "stroke_width"
                                                                                                                                                    },
                                                                                                                                                    "extraState": {
                                                                                                                                                      "arguments": [
                                                                                                                                                        {
                                                                                                                                                          "kind": "positional",
                                                                                                                                                          "name": "name"
                                                                                                                                                        },
                                                                                                                                                        {
                                                                                                                                                          "kind": "keyword",
                                                                                                                                                          "name": "x_range"
                                                                                                                                                        },
                                                                                                                                                        {
                                                                                                                                                          "kind": "keyword",
                                                                                                                                                          "name": "color"
                                                                                                                                                        },
                                                                                                                                                        {
                                                                                                                                                          "kind": "keyword",
                                                                                                                                                          "name": "stroke_width"
                                                                                                                                                        }
                                                                                                                                                      ]
                                                                                                                                                    },
                                                                                                                                                    "inputs": {
                                                                                                                                                      "ARG0": {
                                                                                                                                                        "block": {
                                                                                                                                                          "type": "variables_get",
                                                                                                                                                          "fields": {
                                                                                                                                                            "VAR": {
                                                                                                                                                              "name": "func"
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      },
                                                                                                                                                      "ARG1": {
                                                                                                                                                        "block": {
                                                                                                                                                          "type": "python_list_collection",
                                                                                                                                                          "extraState": {
                                                                                                                                                            "itemCount": 2
                                                                                                                                                          },
                                                                                                                                                          "inputs": {
                                                                                                                                                            "ITEM0": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "math_number",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "NUM": -6
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            },
                                                                                                                                                            "ITEM1": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "math_number",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "NUM": 6
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      },
                                                                                                                                                      "ARG2": {
                                                                                                                                                        "block": {
                                                                                                                                                          "type": "python_dict_get",
                                                                                                                                                          "inputs": {
                                                                                                                                                            "DICT": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "variables_get",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "VAR": {
                                                                                                                                                                    "name": "k_colors"
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            },
                                                                                                                                                            "KEY": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "variables_get",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "VAR": {
                                                                                                                                                                    "name": "b"
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            },
                                                                                                                                                            "DEFAULT": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "visual_python_manim_color_constant",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "VALUE": "RED"
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      },
                                                                                                                                                      "ARG3": {
                                                                                                                                                        "block": {
                                                                                                                                                          "type": "math_number",
                                                                                                                                                          "fields": {
                                                                                                                                                            "NUM": 3
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              },
                                                                                                                                              "next": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "python_list_method",
                                                                                                                                                  "fields": {
                                                                                                                                                    "METHOD": "append"
                                                                                                                                                  },
                                                                                                                                                  "inputs": {
                                                                                                                                                    "LIST": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "variables_get",
                                                                                                                                                        "fields": {
                                                                                                                                                          "VAR": {
                                                                                                                                                            "name": "current_elements"
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    },
                                                                                                                                                    "ARG": {
                                                                                                                                                      "block": {
                                                                                                                                                        "type": "variables_get",
                                                                                                                                                        "fields": {
                                                                                                                                                          "VAR": {
                                                                                                                                                            "name": "line"
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  },
                                                                                                                                                  "next": {
                                                                                                                                                    "block": {
                                                                                                                                                      "type": "variables_set",
                                                                                                                                                      "fields": {
                                                                                                                                                        "VAR": {
                                                                                                                                                          "name": "label_y_pos"
                                                                                                                                                        }
                                                                                                                                                      },
                                                                                                                                                      "inputs": {
                                                                                                                                                        "VALUE": {
                                                                                                                                                          "block": {
                                                                                                                                                            "type": "python_conditional",
                                                                                                                                                            "inputs": {
                                                                                                                                                              "CONDITION": {
                                                                                                                                                                "block": {
                                                                                                                                                                  "type": "logic_compare",
                                                                                                                                                                  "fields": {
                                                                                                                                                                    "OP": "GTE"
                                                                                                                                                                  },
                                                                                                                                                                  "inputs": {
                                                                                                                                                                    "A": {
                                                                                                                                                                      "block": {
                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                        "fields": {
                                                                                                                                                                          "VAR": {
                                                                                                                                                                            "name": "b"
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    },
                                                                                                                                                                    "B": {
                                                                                                                                                                      "block": {
                                                                                                                                                                        "type": "math_number",
                                                                                                                                                                        "fields": {
                                                                                                                                                                          "NUM": 0
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              },
                                                                                                                                                              "TRUE_VALUE": {
                                                                                                                                                                "block": {
                                                                                                                                                                  "type": "math_number",
                                                                                                                                                                  "fields": {
                                                                                                                                                                    "NUM": 3
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              },
                                                                                                                                                              "FALSE_VALUE": {
                                                                                                                                                                "block": {
                                                                                                                                                                  "type": "math_number",
                                                                                                                                                                  "fields": {
                                                                                                                                                                    "NUM": -3
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      },
                                                                                                                                                      "next": {
                                                                                                                                                        "block": {
                                                                                                                                                          "type": "variables_set",
                                                                                                                                                          "fields": {
                                                                                                                                                            "VAR": {
                                                                                                                                                              "name": "label_pos"
                                                                                                                                                            }
                                                                                                                                                          },
                                                                                                                                                          "inputs": {
                                                                                                                                                            "VALUE": {
                                                                                                                                                              "block": {
                                                                                                                                                                "type": "python_call_structured",
                                                                                                                                                                "fields": {
                                                                                                                                                                  "TARGET": "coords.coords_to_point"
                                                                                                                                                                },
                                                                                                                                                                "extraState": {
                                                                                                                                                                  "arguments": [
                                                                                                                                                                    {
                                                                                                                                                                      "kind": "positional",
                                                                                                                                                                      "name": "name"
                                                                                                                                                                    },
                                                                                                                                                                    {
                                                                                                                                                                      "kind": "positional",
                                                                                                                                                                      "name": "name"
                                                                                                                                                                    }
                                                                                                                                                                  ]
                                                                                                                                                                },
                                                                                                                                                                "inputs": {
                                                                                                                                                                  "ARG0": {
                                                                                                                                                                    "block": {
                                                                                                                                                                      "type": "math_number",
                                                                                                                                                                      "fields": {
                                                                                                                                                                        "NUM": 4
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  },
                                                                                                                                                                  "ARG1": {
                                                                                                                                                                    "block": {
                                                                                                                                                                      "type": "variables_get",
                                                                                                                                                                      "fields": {
                                                                                                                                                                        "VAR": {
                                                                                                                                                                          "name": "label_y_pos"
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          },
                                                                                                                                                          "next": {
                                                                                                                                                            "block": {
                                                                                                                                                              "type": "visual_python_manim_assign",
                                                                                                                                                              "fields": {
                                                                                                                                                                "VAR": "label"
                                                                                                                                                              },
                                                                                                                                                              "inputs": {
                                                                                                                                                                "MOBJECT": {
                                                                                                                                                                  "block": {
                                                                                                                                                                    "type": "visual_python_manim_next_to",
                                                                                                                                                                    "inputs": {
                                                                                                                                                                      "MOBJECT": {
                                                                                                                                                                        "block": {
                                                                                                                                                                          "type": "python_new_object_structured",
                                                                                                                                                                          "fields": {
                                                                                                                                                                            "TARGET": "MathTex",
                                                                                                                                                                            "ARG_NAME1": "font_size"
                                                                                                                                                                          },
                                                                                                                                                                          "extraState": {
                                                                                                                                                                            "arguments": [
                                                                                                                                                                              {
                                                                                                                                                                                "kind": "positional",
                                                                                                                                                                                "name": "name"
                                                                                                                                                                              },
                                                                                                                                                                              {
                                                                                                                                                                                "kind": "keyword",
                                                                                                                                                                                "name": "font_size"
                                                                                                                                                                              }
                                                                                                                                                                            ]
                                                                                                                                                                          },
                                                                                                                                                                          "inputs": {
                                                                                                                                                                            "ARG0": {
                                                                                                                                                                              "block": {
                                                                                                                                                                                "type": "python_f_string",
                                                                                                                                                                                "fields": {
                                                                                                                                                                                  "PREFIX": "y = x + ",
                                                                                                                                                                                  "FORMAT": "",
                                                                                                                                                                                  "SUFFIX": ""
                                                                                                                                                                                },
                                                                                                                                                                                "inputs": {
                                                                                                                                                                                  "VALUE": {
                                                                                                                                                                                    "block": {
                                                                                                                                                                                      "type": "variables_get",
                                                                                                                                                                                      "fields": {
                                                                                                                                                                                        "VAR": {
                                                                                                                                                                                          "name": "b"
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            },
                                                                                                                                                                            "ARG1": {
                                                                                                                                                                              "block": {
                                                                                                                                                                                "type": "math_number",
                                                                                                                                                                                "fields": {
                                                                                                                                                                                  "NUM": 24
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            }
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      },
                                                                                                                                                                      "TARGET": {
                                                                                                                                                                        "block": {
                                                                                                                                                                          "type": "variables_get",
                                                                                                                                                                          "fields": {
                                                                                                                                                                            "VAR": {
                                                                                                                                                                              "name": "label_pos"
                                                                                                                                                                            }
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      },
                                                                                                                                                                      "DIRECTION": {
                                                                                                                                                                        "block": {
                                                                                                                                                                          "type": "visual_python_manim_direction_constant",
                                                                                                                                                                          "fields": {
                                                                                                                                                                            "VALUE": "RIGHT"
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      },
                                                                                                                                                                      "BUFF": {
                                                                                                                                                                        "block": {
                                                                                                                                                                          "type": "math_number",
                                                                                                                                                                          "fields": {
                                                                                                                                                                            "NUM": 0.3
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              },
                                                                                                                                                              "next": {
                                                                                                                                                                "block": {
                                                                                                                                                                  "type": "python_list_method",
                                                                                                                                                                  "fields": {
                                                                                                                                                                    "METHOD": "append"
                                                                                                                                                                  },
                                                                                                                                                                  "inputs": {
                                                                                                                                                                    "LIST": {
                                                                                                                                                                      "block": {
                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                        "fields": {
                                                                                                                                                                          "VAR": {
                                                                                                                                                                            "name": "current_elements"
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    },
                                                                                                                                                                    "ARG": {
                                                                                                                                                                      "block": {
                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                        "fields": {
                                                                                                                                                                          "VAR": {
                                                                                                                                                                            "name": "label"
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  },
                                                                                                                                                                  "next": {
                                                                                                                                                                    "block": {
                                                                                                                                                                      "type": "visual_python_manim_assign",
                                                                                                                                                                      "fields": {
                                                                                                                                                                        "VAR": "dot"
                                                                                                                                                                      },
                                                                                                                                                                      "inputs": {
                                                                                                                                                                        "MOBJECT": {
                                                                                                                                                                          "block": {
                                                                                                                                                                            "type": "python_new_object_structured",
                                                                                                                                                                            "fields": {
                                                                                                                                                                              "TARGET": "Dot",
                                                                                                                                                                              "ARG_NAME1": "radius",
                                                                                                                                                                              "ARG_NAME2": "color"
                                                                                                                                                                            },
                                                                                                                                                                            "extraState": {
                                                                                                                                                                              "arguments": [
                                                                                                                                                                                {
                                                                                                                                                                                  "kind": "positional",
                                                                                                                                                                                  "name": "name"
                                                                                                                                                                                },
                                                                                                                                                                                {
                                                                                                                                                                                  "kind": "keyword",
                                                                                                                                                                                  "name": "radius"
                                                                                                                                                                                },
                                                                                                                                                                                {
                                                                                                                                                                                  "kind": "keyword",
                                                                                                                                                                                  "name": "color"
                                                                                                                                                                                }
                                                                                                                                                                              ]
                                                                                                                                                                            },
                                                                                                                                                                            "inputs": {
                                                                                                                                                                              "ARG0": {
                                                                                                                                                                                "block": {
                                                                                                                                                                                  "type": "python_call_structured",
                                                                                                                                                                                  "fields": {
                                                                                                                                                                                    "TARGET": "coords.coords_to_point"
                                                                                                                                                                                  },
                                                                                                                                                                                  "extraState": {
                                                                                                                                                                                    "arguments": [
                                                                                                                                                                                      {
                                                                                                                                                                                        "kind": "positional",
                                                                                                                                                                                        "name": "name"
                                                                                                                                                                                      },
                                                                                                                                                                                      {
                                                                                                                                                                                        "kind": "positional",
                                                                                                                                                                                        "name": "name"
                                                                                                                                                                                      }
                                                                                                                                                                                    ]
                                                                                                                                                                                  },
                                                                                                                                                                                  "inputs": {
                                                                                                                                                                                    "ARG0": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "math_number",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "NUM": 0
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    },
                                                                                                                                                                                    "ARG1": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VAR": {
                                                                                                                                                                                            "name": "b"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              },
                                                                                                                                                                              "ARG1": {
                                                                                                                                                                                "block": {
                                                                                                                                                                                  "type": "math_number",
                                                                                                                                                                                  "fields": {
                                                                                                                                                                                    "NUM": 0.08
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              },
                                                                                                                                                                              "ARG2": {
                                                                                                                                                                                "block": {
                                                                                                                                                                                  "type": "python_dict_get",
                                                                                                                                                                                  "inputs": {
                                                                                                                                                                                    "DICT": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VAR": {
                                                                                                                                                                                            "name": "k_colors"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    },
                                                                                                                                                                                    "KEY": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VAR": {
                                                                                                                                                                                            "name": "b"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    },
                                                                                                                                                                                    "DEFAULT": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "visual_python_manim_color_constant",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VALUE": "RED"
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            }
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      },
                                                                                                                                                                      "next": {
                                                                                                                                                                        "block": {
                                                                                                                                                                          "type": "python_list_method",
                                                                                                                                                                          "fields": {
                                                                                                                                                                            "METHOD": "append"
                                                                                                                                                                          },
                                                                                                                                                                          "inputs": {
                                                                                                                                                                            "LIST": {
                                                                                                                                                                              "block": {
                                                                                                                                                                                "type": "variables_get",
                                                                                                                                                                                "fields": {
                                                                                                                                                                                  "VAR": {
                                                                                                                                                                                    "name": "current_elements"
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            },
                                                                                                                                                                            "ARG": {
                                                                                                                                                                              "block": {
                                                                                                                                                                                "type": "variables_get",
                                                                                                                                                                                "fields": {
                                                                                                                                                                                  "VAR": {
                                                                                                                                                                                    "name": "dot"
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            }
                                                                                                                                                                          },
                                                                                                                                                                          "next": {
                                                                                                                                                                            "block": {
                                                                                                                                                                              "type": "visual_python_manim_assign",
                                                                                                                                                                              "fields": {
                                                                                                                                                                                "VAR": "dot_label"
                                                                                                                                                                              },
                                                                                                                                                                              "inputs": {
                                                                                                                                                                                "MOBJECT": {
                                                                                                                                                                                  "block": {
                                                                                                                                                                                    "type": "visual_python_manim_next_to",
                                                                                                                                                                                    "inputs": {
                                                                                                                                                                                      "MOBJECT": {
                                                                                                                                                                                        "block": {
                                                                                                                                                                                          "type": "python_new_object_structured",
                                                                                                                                                                                          "fields": {
                                                                                                                                                                                            "TARGET": "MathTex",
                                                                                                                                                                                            "ARG_NAME1": "font_size"
                                                                                                                                                                                          },
                                                                                                                                                                                          "extraState": {
                                                                                                                                                                                            "arguments": [
                                                                                                                                                                                              {
                                                                                                                                                                                                "kind": "positional",
                                                                                                                                                                                                "name": "name"
                                                                                                                                                                                              },
                                                                                                                                                                                              {
                                                                                                                                                                                                "kind": "keyword",
                                                                                                                                                                                                "name": "font_size"
                                                                                                                                                                                              }
                                                                                                                                                                                            ]
                                                                                                                                                                                          },
                                                                                                                                                                                          "inputs": {
                                                                                                                                                                                            "ARG0": {
                                                                                                                                                                                              "block": {
                                                                                                                                                                                                "type": "python_f_string",
                                                                                                                                                                                                "fields": {
                                                                                                                                                                                                  "PREFIX": "(0, ",
                                                                                                                                                                                                  "FORMAT": "",
                                                                                                                                                                                                  "SUFFIX": ")"
                                                                                                                                                                                                },
                                                                                                                                                                                                "inputs": {
                                                                                                                                                                                                  "VALUE": {
                                                                                                                                                                                                    "block": {
                                                                                                                                                                                                      "type": "variables_get",
                                                                                                                                                                                                      "fields": {
                                                                                                                                                                                                        "VAR": {
                                                                                                                                                                                                          "name": "b"
                                                                                                                                                                                                        }
                                                                                                                                                                                                      }
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            },
                                                                                                                                                                                            "ARG1": {
                                                                                                                                                                                              "block": {
                                                                                                                                                                                                "type": "math_number",
                                                                                                                                                                                                "fields": {
                                                                                                                                                                                                  "NUM": 20
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      },
                                                                                                                                                                                      "TARGET": {
                                                                                                                                                                                        "block": {
                                                                                                                                                                                          "type": "variables_get",
                                                                                                                                                                                          "fields": {
                                                                                                                                                                                            "VAR": {
                                                                                                                                                                                              "name": "dot"
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      },
                                                                                                                                                                                      "DIRECTION": {
                                                                                                                                                                                        "block": {
                                                                                                                                                                                          "type": "visual_python_manim_direction_constant",
                                                                                                                                                                                          "fields": {
                                                                                                                                                                                            "VALUE": "RIGHT"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      },
                                                                                                                                                                                      "BUFF": {
                                                                                                                                                                                        "block": {
                                                                                                                                                                                          "type": "math_number",
                                                                                                                                                                                          "fields": {
                                                                                                                                                                                            "NUM": 0.2
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              },
                                                                                                                                                                              "next": {
                                                                                                                                                                                "block": {
                                                                                                                                                                                  "type": "python_list_method",
                                                                                                                                                                                  "fields": {
                                                                                                                                                                                    "METHOD": "append"
                                                                                                                                                                                  },
                                                                                                                                                                                  "inputs": {
                                                                                                                                                                                    "LIST": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VAR": {
                                                                                                                                                                                            "name": "current_elements"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    },
                                                                                                                                                                                    "ARG": {
                                                                                                                                                                                      "block": {
                                                                                                                                                                                        "type": "variables_get",
                                                                                                                                                                                        "fields": {
                                                                                                                                                                                          "VAR": {
                                                                                                                                                                                            "name": "dot_label"
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  },
                                                                                                                                                                                  "next": {
                                                                                                                                                                                    "block": {
                                                                                                                                                                                      "type": "python_call_statement_structured",
                                                                                                                                                                                      "fields": {
                                                                                                                                                                                        "TARGET": "self.play",
                                                                                                                                                                                        "ARG_NAME4": "run_time"
                                                                                                                                                                                      },
                                                                                                                                                                                      "extraState": {
                                                                                                                                                                                        "arguments": [
                                                                                                                                                                                          {
                                                                                                                                                                                            "kind": "positional",
                                                                                                                                                                                            "name": "name"
                                                                                                                                                                                          },
                                                                                                                                                                                          {
                                                                                                                                                                                            "kind": "positional",
                                                                                                                                                                                            "name": "name"
                                                                                                                                                                                          },
                                                                                                                                                                                          {
                                                                                                                                                                                            "kind": "positional",
                                                                                                                                                                                            "name": "name"
                                                                                                                                                                                          },
                                                                                                                                                                                          {
                                                                                                                                                                                            "kind": "positional",
                                                                                                                                                                                            "name": "name"
                                                                                                                                                                                          },
                                                                                                                                                                                          {
                                                                                                                                                                                            "kind": "keyword",
                                                                                                                                                                                            "name": "run_time"
                                                                                                                                                                                          }
                                                                                                                                                                                        ]
                                                                                                                                                                                      },
                                                                                                                                                                                      "inputs": {
                                                                                                                                                                                        "ARG0": {
                                                                                                                                                                                          "block": {
                                                                                                                                                                                            "type": "python_call_structured",
                                                                                                                                                                                            "fields": {
                                                                                                                                                                                              "TARGET": "Create"
                                                                                                                                                                                            },
                                                                                                                                                                                            "extraState": {
                                                                                                                                                                                              "arguments": [
                                                                                                                                                                                                {
                                                                                                                                                                                                  "kind": "positional",
                                                                                                                                                                                                  "name": "name"
                                                                                                                                                                                                }
                                                                                                                                                                                              ]
                                                                                                                                                                                            },
                                                                                                                                                                                            "inputs": {
                                                                                                                                                                                              "ARG0": {
                                                                                                                                                                                                "block": {
                                                                                                                                                                                                  "type": "variables_get",
                                                                                                                                                                                                  "fields": {
                                                                                                                                                                                                    "VAR": {
                                                                                                                                                                                                      "name": "line"
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        },
                                                                                                                                                                                        "ARG1": {
                                                                                                                                                                                          "block": {
                                                                                                                                                                                            "type": "python_call_structured",
                                                                                                                                                                                            "fields": {
                                                                                                                                                                                              "TARGET": "Write"
                                                                                                                                                                                            },
                                                                                                                                                                                            "extraState": {
                                                                                                                                                                                              "arguments": [
                                                                                                                                                                                                {
                                                                                                                                                                                                  "kind": "positional",
                                                                                                                                                                                                  "name": "name"
                                                                                                                                                                                                }
                                                                                                                                                                                              ]
                                                                                                                                                                                            },
                                                                                                                                                                                            "inputs": {
                                                                                                                                                                                              "ARG0": {
                                                                                                                                                                                                "block": {
                                                                                                                                                                                                  "type": "variables_get",
                                                                                                                                                                                                  "fields": {
                                                                                                                                                                                                    "VAR": {
                                                                                                                                                                                                      "name": "label"
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        },
                                                                                                                                                                                        "ARG2": {
                                                                                                                                                                                          "block": {
                                                                                                                                                                                            "type": "python_call_structured",
                                                                                                                                                                                            "fields": {
                                                                                                                                                                                              "TARGET": "Create"
                                                                                                                                                                                            },
                                                                                                                                                                                            "extraState": {
                                                                                                                                                                                              "arguments": [
                                                                                                                                                                                                {
                                                                                                                                                                                                  "kind": "positional",
                                                                                                                                                                                                  "name": "name"
                                                                                                                                                                                                }
                                                                                                                                                                                              ]
                                                                                                                                                                                            },
                                                                                                                                                                                            "inputs": {
                                                                                                                                                                                              "ARG0": {
                                                                                                                                                                                                "block": {
                                                                                                                                                                                                  "type": "variables_get",
                                                                                                                                                                                                  "fields": {
                                                                                                                                                                                                    "VAR": {
                                                                                                                                                                                                      "name": "dot"
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        },
                                                                                                                                                                                        "ARG3": {
                                                                                                                                                                                          "block": {
                                                                                                                                                                                            "type": "python_call_structured",
                                                                                                                                                                                            "fields": {
                                                                                                                                                                                              "TARGET": "Write"
                                                                                                                                                                                            },
                                                                                                                                                                                            "extraState": {
                                                                                                                                                                                              "arguments": [
                                                                                                                                                                                                {
                                                                                                                                                                                                  "kind": "positional",
                                                                                                                                                                                                  "name": "name"
                                                                                                                                                                                                }
                                                                                                                                                                                              ]
                                                                                                                                                                                            },
                                                                                                                                                                                            "inputs": {
                                                                                                                                                                                              "ARG0": {
                                                                                                                                                                                                "block": {
                                                                                                                                                                                                  "type": "variables_get",
                                                                                                                                                                                                  "fields": {
                                                                                                                                                                                                    "VAR": {
                                                                                                                                                                                                      "name": "dot_label"
                                                                                                                                                                                                    }
                                                                                                                                                                                                  }
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        },
                                                                                                                                                                                        "ARG4": {
                                                                                                                                                                                          "block": {
                                                                                                                                                                                            "type": "math_number",
                                                                                                                                                                                            "fields": {
                                                                                                                                                                                              "NUM": 1.2
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      },
                                                                                                                                                                                      "next": {
                                                                                                                                                                                        "block": {
                                                                                                                                                                                          "type": "visual_python_manim_wait",
                                                                                                                                                                                          "inputs": {
                                                                                                                                                                                            "SECONDS": {
                                                                                                                                                                                              "block": {
                                                                                                                                                                                                "type": "math_number",
                                                                                                                                                                                                "fields": {
                                                                                                                                                                                                  "NUM": 1
                                                                                                                                                                                                }
                                                                                                                                                                                              }
                                                                                                                                                                                            }
                                                                                                                                                                                          }
                                                                                                                                                                                        }
                                                                                                                                                                                      }
                                                                                                                                                                                    }
                                                                                                                                                                                  }
                                                                                                                                                                                }
                                                                                                                                                                              }
                                                                                                                                                                            }
                                                                                                                                                                          }
                                                                                                                                                                        }
                                                                                                                                                                      }
                                                                                                                                                                    }
                                                                                                                                                                  }
                                                                                                                                                                }
                                                                                                                                                              }
                                                                                                                                                            }
                                                                                                                                                          }
                                                                                                                                                        }
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                },
                                                                                                                                "next": {
                                                                                                                                  "block": {
                                                                                                                                    "type": "visual_python_manim_wait",
                                                                                                                                    "inputs": {
                                                                                                                                      "SECONDS": {
                                                                                                                                        "block": {
                                                                                                                                          "type": "math_number",
                                                                                                                                          "fields": {
                                                                                                                                            "NUM": 2
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    },
                                                                                                                                    "next": {
                                                                                                                                      "block": {
                                                                                                                                        "type": "python_call_statement_structured",
                                                                                                                                        "fields": {
                                                                                                                                          "TARGET": "self.play",
                                                                                                                                          "ARG_NAME1": "run_time"
                                                                                                                                        },
                                                                                                                                        "extraState": {
                                                                                                                                          "arguments": [
                                                                                                                                            {
                                                                                                                                              "kind": "positional",
                                                                                                                                              "name": "name"
                                                                                                                                            },
                                                                                                                                            {
                                                                                                                                              "kind": "keyword",
                                                                                                                                              "name": "run_time"
                                                                                                                                            }
                                                                                                                                          ]
                                                                                                                                        },
                                                                                                                                        "inputs": {
                                                                                                                                          "ARG0": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "python_call_structured",
                                                                                                                                              "fields": {
                                                                                                                                                "TARGET": "FadeOut"
                                                                                                                                              },
                                                                                                                                              "extraState": {
                                                                                                                                                "arguments": [
                                                                                                                                                  {
                                                                                                                                                    "kind": "positional",
                                                                                                                                                    "name": "name"
                                                                                                                                                  },
                                                                                                                                                  {
                                                                                                                                                    "kind": "positional",
                                                                                                                                                    "name": "name"
                                                                                                                                                  },
                                                                                                                                                  {
                                                                                                                                                    "kind": "positional",
                                                                                                                                                    "name": "name"
                                                                                                                                                  },
                                                                                                                                                  {
                                                                                                                                                    "kind": "positional",
                                                                                                                                                    "name": "name"
                                                                                                                                                  },
                                                                                                                                                  {
                                                                                                                                                    "kind": "star",
                                                                                                                                                    "name": "name"
                                                                                                                                                  },
                                                                                                                                                  {
                                                                                                                                                    "kind": "positional",
                                                                                                                                                    "name": "name"
                                                                                                                                                  }
                                                                                                                                                ]
                                                                                                                                              },
                                                                                                                                              "inputs": {
                                                                                                                                                "ARG0": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "coords"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                },
                                                                                                                                                "ARG1": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "x_label"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                },
                                                                                                                                                "ARG2": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "y_label"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                },
                                                                                                                                                "ARG3": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "origin_label"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                },
                                                                                                                                                "ARG4": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "current_elements"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                },
                                                                                                                                                "ARG5": {
                                                                                                                                                  "block": {
                                                                                                                                                    "type": "variables_get",
                                                                                                                                                    "fields": {
                                                                                                                                                      "VAR": {
                                                                                                                                                        "name": "b_title"
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          },
                                                                                                                                          "ARG1": {
                                                                                                                                            "block": {
                                                                                                                                              "type": "math_number",
                                                                                                                                              "fields": {
                                                                                                                                                "NUM": 1.5
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        },
                                                                                                                                        "next": {
                                                                                                                                          "block": {
                                                                                                                                            "type": "visual_python_manim_wait",
                                                                                                                                            "inputs": {
                                                                                                                                              "SECONDS": {
                                                                                                                                                "block": {
                                                                                                                                                  "type": "math_number",
                                                                                                                                                  "fields": {
                                                                                                                                                    "NUM": 0.5
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      ]
    }
  },
  "plugins": {
    "requirements": [
      {
        "id": "visual-python.manim",
        "version": "0.1.0"
      }
    ],
    "data": {}
  },
  "workspaceMode": "split"
}
